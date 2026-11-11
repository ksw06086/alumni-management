const API_URL = import.meta.env.VITE_API_BASE_URL || '';

/** Sends one JSON request through the configured API proxy and normalizes errors. */
export async function api(action, payload = {}) {
  if (!API_URL) {
    throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다. 배포 설정을 확인하세요.');
  }

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (_) {
    throw new Error('서버에 연결할 수 없습니다. 네트워크와 API 설정을 확인하세요.');
  }

  let result;
  try {
    result = await response.json();
  } catch (_) {
    throw new Error(`서버 응답을 읽을 수 없습니다. (HTTP ${response.status})`);
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
  }

  return result;
}
