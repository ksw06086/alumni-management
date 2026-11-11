export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const allowed = allowedOrigins.includes(origin);
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path.startsWith('/archive/download/')) {
      if (origin && !allowed) return json({ ok: false, error: 'Origin is not allowed.' }, 403, origin);
      return downloadArchiveTicket(path.split('/').pop(), env, origin);
    }
    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403, headers: securityHeaders() });
      return new Response(null, { status: 204, headers: { ...securityHeaders(), ...corsHeaders(origin) } });
    }
    if (!allowed) return json({ ok: false, error: 'Origin is not allowed.' }, 403);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST requests only.' }, 405, origin);
    if (new URL(request.url).pathname.endsWith('/archive/chunk')) return uploadArchiveChunk(request, env, origin);
    if (new URL(request.url).pathname.endsWith('/archive/cancel')) return cancelArchiveUpload(request, env, origin);
    if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'JSON requests only.' }, 415, origin);
    const body = await request.text();
    if (body.length > 1024 * 1024) return json({ ok: false, error: 'Request is too large.' }, 413, origin);
    let payload;
    try { payload = JSON.parse(body); } catch (_) { return json({ ok: false, error: 'Invalid JSON request.' }, 400, origin); }
    if (payload.action === 'holidays') return getHolidays(payload, env, origin);
    if (payload.action === 'archiveUploadStart') return startArchiveUploads(payload, env, origin);
    if (payload.action === 'archiveDownload') return downloadArchiveFile(payload, env, origin, request.url);
    if (payload.action === 'deleteArchivePost') return deleteArchivePost(payload, env, origin);
    if (payload.action === 'deleteArchiveFile') return deleteArchiveFile(payload, env, origin);

    const target = env.APPS_SCRIPT_URL;
    if (!target || target.includes('REPLACE_WITH')) return json({ ok: false, error: 'Cloudflare Worker APPS_SCRIPT_URL is not configured.' }, 503, origin);
    try {
      const upstream = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'follow' });
      const responseBody = await upstream.text();
      return new Response(responseBody, { status: upstream.status, headers: { ...securityHeaders(), ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (error) {
      console.error('Apps Script request failed', error?.message || error);
      return json({ ok: false, error: 'Google Apps Script에 연결할 수 없습니다.' }, 502, origin);
    }
  },
};

async function getHolidays(payload, env, origin) {
  const year = String(payload.year || '');
  const rawMonth = String(payload.month || '');
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(rawMonth) || Number(rawMonth) < 1 || Number(rawMonth) > 12) {
    return json({ ok: false, error: 'Invalid holiday year or month.' }, 400, origin);
  }
  if (!env.HOLIDAY_API_KEY) return json({ ok: false, code: 'HOLIDAY_KEY_MISSING', error: 'Cloudflare Worker secret HOLIDAY_API_KEY is not configured.' }, 503, origin);
  const month = rawMonth.padStart(2, '0');
  const url = new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo');
  url.searchParams.set('serviceKey', env.HOLIDAY_API_KEY);
  url.searchParams.set('solYear', year);
  url.searchParams.set('solMonth', month);
  url.searchParams.set('_type', 'json');
  try {
    const upstream = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!upstream.ok) {
      console.error('Holiday API HTTP error', upstream.status, year, month);
      return json({ ok: false, code: 'HOLIDAY_UPSTREAM_HTTP', error: `Holiday API HTTP ${upstream.status}.` }, 502, origin);
    }
    const data = await upstream.json();
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== '00') {
      console.error('Holiday API service error', header.resultCode, header.resultMsg, year, month);
      const authFailure = /key|인증|service/i.test(`${header.resultCode} ${header.resultMsg}`);
      return json({ ok: false, code: authFailure ? 'HOLIDAY_AUTH_ERROR' : 'HOLIDAY_UPSTREAM_SERVICE', error: `Holiday API error: ${header.resultMsg || header.resultCode}` }, 502, origin);
    }
    const rawItems = data?.response?.body?.items?.item;
    const items = rawItems == null ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];
    const holidays = items.filter(item => item.isHoliday === 'Y').map(item => ({
      date: String(item.locdate), name: String(item.dateName || ''), isHoliday: item.isHoliday,
    })).filter(item => /^\d{8}$/.test(item.date) && item.name);
    return json({ ok: true, year, month, holidays }, 200, origin);
  } catch (error) {
    console.error('Holiday API request or JSON parse failed', error?.message || error, year, month);
    return json({ ok: false, code: 'HOLIDAY_UPSTREAM_ERROR', error: 'Holiday API connection or response processing failed.' }, 502, origin);
  }
}

async function callAppsScript(payload, env) {
  const target = env.APPS_SCRIPT_URL;
  if (!target || target.includes('REPLACE_WITH')) throw new Error('Apps Script URL is not configured.');
  const upstream = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, bridgeSecret: env.ARCHIVE_BRIDGE_SECRET }), redirect: 'follow' });
  const data = await upstream.json();
  if (!upstream.ok || !data.ok) throw new Error(data.error || `Apps Script returned HTTP ${upstream.status}.`);
  return data;
}

async function startArchiveUploads(payload, env, origin) {
  if (!env.ARCHIVE_UPLOADS || !env.ARCHIVE_BRIDGE_SECRET) return json({ ok: false, error: '자료실 업로드 저장소 설정이 완료되지 않았습니다.' }, 503, origin);
  try {
    const data = await callAppsScript(payload, env);
    const uploads = [];
    for (const upload of data.uploads || []) {
      if (!String(upload.sessionUrl || '').startsWith('https://www.googleapis.com/upload/drive/v3/files?')) throw new Error('Google Drive upload session URL is invalid.');
      const state = { ...upload, token: String(payload.token || ''), offset: 0, totalSize: Number(upload.fileSize) };
      await env.ARCHIVE_UPLOADS.put(`upload:${upload.uploadId}`, JSON.stringify(state), { expirationTtl: 604800 });
      const { sessionUrl, token, ...clientUpload } = state;
      uploads.push(clientUpload);
    }
    return json({ ok: true, uploads }, 200, origin);
  } catch (error) {
    console.error('Archive upload initialization failed', error?.message || error);
    return json({ ok: false, error: error.message || '자료실 업로드 준비에 실패했습니다.' }, 502, origin);
  }
}

async function uploadArchiveChunk(request, env, origin) {
  if (!env.ARCHIVE_UPLOADS || !env.ARCHIVE_BRIDGE_SECRET) return json({ ok: false, error: '자료실 업로드 저장소 설정이 완료되지 않았습니다.' }, 503, origin);
  const uploadId = request.headers.get('X-Upload-Id') || '';
  const token = request.headers.get('X-Session-Token') || '';
  const start = Number(request.headers.get('X-Chunk-Start'));
  const stateRaw = await env.ARCHIVE_UPLOADS.get(`upload:${uploadId}`);
  if (!stateRaw) return json({ ok: false, error: '업로드 세션이 만료되었습니다. 파일을 다시 선택해 주세요.' }, 410, origin);
  const state = JSON.parse(stateRaw);
  if (!token || token !== state.token) return json({ ok: false, error: '업로드 권한이 없습니다.' }, 403, origin);
  if (state.completedFile) return finishArchiveUpload(state, state.completedFile, env, origin);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(state.totalSize)) return json({ ok: false, error: '업로드 위치 정보가 올바르지 않습니다.' }, 400, origin);
  try {
    const auth = await callAppsScript({ action: 'session', token }, env);
    if (auth.user?.role !== 'admin') return json({ ok: false, error: '관리자만 파일을 업로드할 수 있습니다.' }, 403, origin);
    const chunk = await request.arrayBuffer();
    if (!chunk.byteLength || chunk.byteLength > 8 * 1024 * 1024 || start + chunk.byteLength > state.totalSize) return json({ ok: false, error: '업로드 데이터 크기가 올바르지 않습니다.' }, 400, origin);
    if (start === 0 && !validArchiveSignature(state.extension, new Uint8Array(chunk))) return json({ ok: false, error: '파일 내용이 허용된 파일 형식과 일치하지 않습니다.' }, 415, origin);
    const status = await fetch(state.sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${state.totalSize}` } });
    if (status.status !== 308) {
      if (status.ok) {
        state.completedFile = await status.json();
        await env.ARCHIVE_UPLOADS.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 604800 });
        return finishArchiveUpload(state, state.completedFile, env, origin);
      }
      if (status.status !== 404) throw new Error(`Google Drive upload status check failed (${status.status}).`);
      return json({ ok: false, error: 'Google Drive 업로드 세션이 만료되었습니다. 다시 시도해 주세요.' }, 410, origin);
    }
    const actualOffset = offsetFromRange(status.headers.get('Range'));
    if (actualOffset !== start) {
      state.offset = actualOffset;
      await env.ARCHIVE_UPLOADS.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 604800 });
      return json({ ok: true, received: actualOffset, total: state.totalSize, done: false }, 200, origin);
    }
    const end = start + chunk.byteLength;
    const upstream = await fetch(state.sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end - 1}/${state.totalSize}`, 'Content-Type': state.mimeType }, body: chunk });
    if (upstream.status === 308) {
      state.offset = offsetFromRange(upstream.headers.get('Range'));
      await env.ARCHIVE_UPLOADS.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 604800 });
      return json({ ok: true, received: state.offset, total: state.totalSize, done: false }, 200, origin);
    }
    if (!upstream.ok) {
      const msg = await upstream.text();
      console.error('Drive chunk upload error', upstream.status, msg.slice(0, 300));
      return json({ ok: false, error: 'Google Drive 파일 업로드에 실패했습니다.' }, 502, origin);
    }
    state.completedFile = await upstream.json();
    await env.ARCHIVE_UPLOADS.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 604800 });
    return finishArchiveUpload(state, state.completedFile, env, origin);
  } catch (error) {
    console.error('Archive chunk upload failed', error?.message || error);
    return json({ ok: false, error: error.message || '파일 업로드 중 오류가 발생했습니다.' }, 502, origin);
  }
}

function validArchiveSignature(extension, bytes) {
  const ascii = (offset, count) => String.fromCharCode(...bytes.slice(offset, offset + count));
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  const zip = starts(0x50,0x4b) && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6) || (bytes[2] === 7 && bytes[3] === 8));
  const ole = starts(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
  switch (extension) {
    case 'png': return starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
    case 'jpg': case 'jpeg': return starts(0xff,0xd8,0xff);
    case 'gif': return ['GIF87a','GIF89a'].includes(ascii(0,6));
    case 'bmp': return ascii(0,2) === 'BM';
    case 'webp': return ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP';
    case 'mp4': case 'mov': return ascii(4,4) === 'ftyp';
    case 'webm': return starts(0x1a,0x45,0xdf,0xa3);
    case 'avi': return ascii(0,4) === 'RIFF' && ascii(8,4) === 'AVI ';
    case 'pdf': return ascii(0,5) === '%PDF-';
    case 'zip': return zip;
    case 'xlsx': case 'docx': case 'pptx': case 'hwpx': return zip;
    case 'xls': case 'doc': case 'ppt': case 'hwp': return ole;
    case 'txt': case 'csv': return !bytes.slice(0, 4096).includes(0);
    default: return false;
  }
}

async function finishArchiveUpload(state, file, env, origin) {
  try {
    const saved = await callAppsScript({
      action: 'archiveUploadComplete', token: state.token, postId: state.postId, fileId: state.fileId,
      driveFileId: file.id, driveFolderId: state.driveFolderId, originalFilename: state.originalFilename,
      storedFilename: state.storedFilename, fileType: state.fileType, mimeType: state.mimeType, fileSize: state.fileSize,
    }, env);
    await env.ARCHIVE_UPLOADS.delete(`upload:${state.uploadId}`);
    return json({ ok: true, done: true, file: { fileId: saved.fileId, originalFilename: state.originalFilename, fileType: state.fileType, mimeType: state.mimeType, fileSize: saved.fileSize } }, 200, origin);
  } catch (error) {
    console.error('Drive upload completed but metadata commit failed', state.fileId, error?.message || error);
    return json({ ok: false, code: 'ARCHIVE_METADATA_COMMIT_FAILED', error: '파일 업로드는 됐지만 자료실 기록 저장에 실패했습니다. 같은 업로드를 재시도해 주세요.' }, 502, origin);
  }
}

function offsetFromRange(value) { const match = String(value || '').match(/(?:bytes=)?0-(\d+)/i); return match ? Number(match[1]) + 1 : 0; }

async function cancelArchiveUpload(request, env, origin) {
  if (!env.ARCHIVE_UPLOADS) return json({ ok: false, error: '자료실 업로드 저장소 설정이 완료되지 않았습니다.' }, 503, origin);
  const uploadId = request.headers.get('X-Upload-Id') || '';
  const token = request.headers.get('X-Session-Token') || '';
  const raw = await env.ARCHIVE_UPLOADS.get(`upload:${uploadId}`);
  if (!raw) return json({ ok: true }, 200, origin);
  const state = JSON.parse(raw);
  if (!token || token !== state.token) return json({ ok: false, error: '업로드 취소 권한이 없습니다.' }, 403, origin);
  await env.ARCHIVE_UPLOADS.delete(`upload:${uploadId}`);
  return json({ ok: true }, 200, origin);
}

async function downloadArchiveFile(payload, env, origin, requestUrl) {
  if (!env.ARCHIVE_UPLOADS || !env.ARCHIVE_BRIDGE_SECRET) return json({ ok: false, error: '자료실 파일 저장소 설정이 완료되지 않았습니다.' }, 503, origin);
  try {
    const info = await callAppsScript({ action: 'archiveDownloadInfo', token: payload.token, fileId: payload.fileId }, env);
    const ticket = crypto.randomUUID();
    await env.ARCHIVE_UPLOADS.put(`download:${ticket}`, JSON.stringify(info), { expirationTtl: 300 });
    return json({ ok: true, downloadUrl: `${new URL(requestUrl).origin}/archive/download/${ticket}` }, 200, origin);
  } catch (error) {
    console.error('Archive download authorization failed', error?.message || error);
    return json({ ok: false, error: error.message || '파일 다운로드 권한을 확인하지 못했습니다.' }, 403, origin);
  }
}

async function downloadArchiveTicket(ticket, env, origin) {
  if (!env.ARCHIVE_UPLOADS || !/^[0-9a-f-]{36}$/i.test(ticket)) return json({ ok: false, error: '다운로드 주소가 유효하지 않습니다.' }, 404, origin);
  try {
    const key = `download:${ticket}`;
    const raw = await env.ARCHIVE_UPLOADS.get(key);
    if (!raw) return json({ ok: false, error: '다운로드 주소가 만료되었습니다. 다시 요청해 주세요.' }, 410, origin);
    await env.ARCHIVE_UPLOADS.delete(key);
    const info = JSON.parse(raw);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(info.driveFileId)}?alt=media`, { headers: { Authorization: `Bearer ${info.driveToken}` } });
    if (!response.ok) {
      console.error('Archive Drive download failed', response.status, info.driveFileId);
      return json({ ok: false, error: '파일을 다운로드하지 못했습니다.' }, response.status === 404 ? 404 : 502, origin);
    }
    const filename = String(info.filename || 'download').replace(/[\r\n"\\]/g, '_');
    const headers = { ...securityHeaders(), 'Content-Type': info.mimeType || 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` };
    if (info.fileSize) headers['Content-Length'] = String(info.fileSize);
    if (origin) Object.assign(headers, corsHeaders(origin));
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    console.error('Archive Drive download failed', error?.message || error);
    return json({ ok: false, error: error.message || '파일 다운로드에 실패했습니다.' }, 502, origin);
  }
}

async function deleteArchivePost(payload, env, origin) {
  try {
    const prepared = await callAppsScript({ action: 'archivePreparePostDelete', token: payload.token, postId: payload.postId }, env);
    const failed = [];
    for (const file of prepared.files || []) {
      const result = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${prepared.driveToken}` } });
      if (!result.ok && result.status !== 404) failed.push(file.fileId);
    }
    return json(await callAppsScript({ action: 'archiveCompletePostDelete', token: payload.token, postId: payload.postId, failedFileIds: failed }, env), 200, origin);
  } catch (error) {
    console.error('Archive post deletion failed', error?.message || error);
    return json({ ok: false, error: error.message || '자료 삭제에 실패했습니다.' }, 502, origin);
  }
}

async function deleteArchiveFile(payload, env, origin) {
  try {
    const prepared = await callAppsScript({ action: 'archivePrepareFileDelete', token: payload.token, fileId: payload.fileId }, env);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(prepared.driveFileId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${prepared.driveToken}` } });
    if (!response.ok && response.status !== 404) throw new Error(`Google Drive file delete failed (${response.status}).`);
    return json(await callAppsScript({ action: 'archiveCompleteFileDelete', token: payload.token, fileId: payload.fileId }, env), 200, origin);
  } catch (error) {
    console.error('Archive file deletion failed', error?.message || error);
    return json({ ok: false, error: error.message || '첨부파일 삭제에 실패했습니다.' }, 502, origin);
  }
}

function corsHeaders(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Id, X-Session-Token, X-Chunk-Start', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}
function securityHeaders() {
  return { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
}
function json(value, status = 200, origin = '') {
  return new Response(JSON.stringify(value), { status, headers: { ...securityHeaders(), ...(origin ? corsHeaders(origin) : {}), 'Content-Type': 'application/json; charset=utf-8' } });
}
