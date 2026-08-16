const { PassThrough } = require('stream');
const { assert, test } = require('../helpers/test-runner');
const { parseJson, parseMultipart } = require('../../src/http/body');

function request(body, headers = {}) {
  const stream = new PassThrough();
  stream.headers = headers;
  stream.end(body);
  return stream;
}

test('parses bounded json requests', async () => {
  assert.deepStrictEqual(await parseJson(request('{"name":"林女士"}'), 100), { name: '林女士' });
  await assert.rejects(() => parseJson(request('x'.repeat(11)), 10), (error) => error.code === 'PAYLOAD_TOO_LARGE');
});

test('parses multipart fields and one binary image', async () => {
  const boundary = 'mingyuan-boundary';
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="memberId"\r\n\r\nmember-lin\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="tongue.webp"\r\nContent-Type: image/webp\r\n\r\nimage-bytes\r\n` +
    `--${boundary}--\r\n`,
    'latin1'
  );
  const result = await parseMultipart(request(body, { 'content-type': `multipart/form-data; boundary=${boundary}` }), 1024);
  assert.strictEqual(result.fields.memberId, 'member-lin');
  assert.strictEqual(result.file.mimeType, 'image/webp');
  assert.strictEqual(result.file.buffer.toString(), 'image-bytes');
});
