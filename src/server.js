const http = require('http');
const path = require('path');
const { createApp } = require('./http/app');

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const root = path.resolve(__dirname, '..');
const app = createApp({ dataDir: path.join(root, 'data'), publicDir: path.join(root, 'public') });

app.init().then(() => {
  const server = http.createServer(app.handler);
  server.listen(port, host, () => {
    process.stdout.write(`明膳家庭食养已启动：http://${host}:${port}\n`);
  });
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
