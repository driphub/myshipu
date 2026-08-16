export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { ...options, headers, body });
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(result?.message || '请求失败', response.status, result?.code, result?.details);
  return result;
}

export function mediaUrl(value) {
  if (!value) return '';
  const source = String(value);
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) return source;
  if (/^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith('//')) {
    throw new ApiError('图片地址不安全', 400, 'VALIDATION_ERROR');
  }
  const relative = source.replace(/^\/+/, '');
  if (!/^(?:assets\/images|uploads)\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp)$/.test(relative)) {
    throw new ApiError('图片地址不安全', 400, 'VALIDATION_ERROR');
  }
  return new URL(relative, document.baseURI).href;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
