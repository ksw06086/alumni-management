export default {
  async fetch(request, env) {
    // 브라우저 요청은 허용 Origin, 메서드, Content-Type을 먼저 검사한 뒤 Apps Script로 전달합니다.
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const allowed = allowedOrigins.includes(origin);
    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403, headers: securityHeaders() });
      return new Response(null, { status: 204, headers: { ...securityHeaders(), ...corsHeaders(origin) } });
    }
    if (!allowed) return json({ ok: false, error: '허용되지 않은 출처입니다.' }, 403);
    if (request.method !== 'POST') return json({ ok: false, error: 'POST 요청만 허용됩니다.' }, 405, origin);
    if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'JSON 요청만 허용됩니다.' }, 415, origin);
    // Apps Script 주소와 비밀 설정은 Worker 환경에서만 읽어 클라이언트 번들에 노출하지 않습니다.
    const target = env.APPS_SCRIPT_URL;
    if (!target || target.includes('REPLACE_WITH')) return json({ ok: false, error: 'Cloudflare Worker의 APPS_SCRIPT_URL이 설정되지 않았습니다.' }, 503, origin);
    const body = await request.text();
    if (body.length > 1024 * 1024) return json({ ok: false, error: '요청 크기가 너무 큽니다.' }, 413, origin);
    try {
      const upstream = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'follow' });
      const responseBody = await upstream.text();
      return new Response(responseBody, { status: upstream.status, headers: { ...securityHeaders(), ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (_) {
      return json({ ok: false, error: 'Google Apps Script에 연결할 수 없습니다.' }, 502, origin);
    }
  }
};

function corsHeaders(origin) {
  // 허용된 단일 Origin에만 CORS 응답 헤더를 붙입니다.
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}
function securityHeaders() {
  // API 응답 캐시와 브라우저의 MIME 추측을 막는 기본 보안 헤더입니다.
  return { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
}
function json(value, status = 200, origin = '') {
  return new Response(JSON.stringify(value), { status, headers: { ...securityHeaders(), ...(origin ? corsHeaders(origin) : {}), 'Content-Type': 'application/json; charset=utf-8' } });
}
