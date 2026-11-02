export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const allowed = allowedOrigins.includes(origin);
    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403, headers: securityHeaders() });
      return new Response(null, { status: 204, headers: { ...securityHeaders(), ...corsHeaders(origin) } });
    }
    if (!allowed) return json({ ok: false, error: 'Origin is not allowed.' }, 403);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST requests only.' }, 405, origin);
    if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'JSON requests only.' }, 415, origin);
    const body = await request.text();
    if (body.length > 1024 * 1024) return json({ ok: false, error: 'Request is too large.' }, 413, origin);
    let payload;
    try { payload = JSON.parse(body); } catch (_) { return json({ ok: false, error: 'Invalid JSON request.' }, 400, origin); }
    if (payload.action === 'holidays') return getHolidays(payload, env, origin);

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

function corsHeaders(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}
function securityHeaders() {
  return { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
}
function json(value, status = 200, origin = '') {
  return new Response(JSON.stringify(value), { status, headers: { ...securityHeaders(), ...(origin ? corsHeaders(origin) : {}), 'Content-Type': 'application/json; charset=utf-8' } });
}
