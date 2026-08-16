const { ServiceError } = require('../services/errors');

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(new ServiceError('PAYLOAD_TOO_LARGE', '请求内容过大', 413));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!settled) resolve(Buffer.concat(chunks)); });
    request.on('error', (error) => { if (!settled) reject(error); });
  });
}

async function parseJson(request, maxBytes = 1024 * 1024) {
  const buffer = await readBody(request, maxBytes);
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (_) {
    throw new ServiceError('VALIDATION_ERROR', 'JSON 格式不正确', 400);
  }
}

async function parseMultipart(request, maxBytes = 6 * 1024 * 1024) {
  const contentType = request.headers['content-type'] || '';
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new ServiceError('VALIDATION_ERROR', '缺少 multipart boundary', 400);
  const boundary = match[1] || match[2];
  const buffer = await readBody(request, maxBytes);
  const source = buffer.toString('latin1');
  const parts = source.split(`--${boundary}`).slice(1, -1);
  const fields = {};
  let file = null;

  for (let part of parts) {
    if (part.startsWith('\r\n')) part = part.slice(2);
    if (part.endsWith('\r\n')) part = part.slice(0, -2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const rawHeaders = part.slice(0, headerEnd);
    const content = part.slice(headerEnd + 4);
    const disposition = rawHeaders.match(/content-disposition:\s*form-data;[^\r\n]*/i);
    const nameMatch = disposition && disposition[0].match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const fileNameMatch = disposition[0].match(/filename="([^"]*)"/i);
    if (fileNameMatch) {
      if (file) throw new ServiceError('VALIDATION_ERROR', '一次只能上传一张图片', 400);
      const typeMatch = rawHeaders.match(/content-type:\s*([^\r\n]+)/i);
      file = {
        fieldName: name,
        originalName: fileNameMatch[1],
        mimeType: typeMatch ? typeMatch[1].trim().toLowerCase() : 'application/octet-stream',
        buffer: Buffer.from(content, 'latin1'),
      };
    } else {
      fields[name] = Buffer.from(content, 'latin1').toString('utf8');
    }
  }
  return { fields, file };
}

module.exports = { readBody, parseJson, parseMultipart };
