const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { JsonRepository } = require('../storage/json-repository');
const { createSeedData } = require('../storage/seed-data');
const { UploadStore } = require('../storage/upload-store');
const { FamilyService } = require('../services/family-service');
const { TongueService } = require('../services/tongue-service');
const { RecommendationService } = require('../services/recommendation-service');
const { ValidationError } = require('../domain/validation');
const { ServiceError } = require('../services/errors');
const { parseJson, parseMultipart } = require('./body');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length });
  response.end(body);
}

function noContent(response) {
  response.writeHead(204);
  response.end();
}

function decodeJsonField(value, fallback) {
  if (value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch (_) { throw new ServiceError('VALIDATION_ERROR', '表单 JSON 字段格式不正确', 400); }
}

function createApp({ dataDir, publicDir }) {
  const repository = new JsonRepository({ dataDir, seedData: createSeedData() });
  const uploadStore = new UploadStore({ dataDir });
  const familyService = new FamilyService({ repository, uploadStore });
  const tongueService = new TongueService({ repository, uploadStore });
  const recommendationService = new RecommendationService({ repository });

  async function init() {
    await repository.init();
    const records = (await repository.read('tongue-records')).records;
    await uploadStore.cleanup(records.map((record) => record.photoPath).filter(Boolean));
  }

  async function routeApi(request, response, url) {
    const method = request.method;
    const pathname = url.pathname;
    let match;

    if (pathname === '/api/health' && method === 'GET') return json(response, 200, { status: 'ok' });
    if (pathname === '/api/taxonomy' && method === 'GET') {
      const { TAXONOMY, LABELS } = require('../domain/taxonomy');
      return json(response, 200, { taxonomy: TAXONOMY, labels: LABELS });
    }
    if (pathname === '/api/family' && method === 'GET') return json(response, 200, { members: await familyService.list() });
    if (pathname === '/api/family' && method === 'POST') return json(response, 201, { member: await familyService.create(await parseJson(request)) });
    if ((match = pathname.match(/^\/api\/family\/([^/]+)$/))) {
      const id = decodeURIComponent(match[1]);
      if (method === 'GET') return json(response, 200, { member: await familyService.get(id) });
      if (method === 'PUT') return json(response, 200, { member: await familyService.update(id, await parseJson(request)) });
      if (method === 'DELETE') { await familyService.remove(id); return noContent(response); }
    }
    if (pathname === '/api/library' && method === 'GET') {
      const type = url.searchParams.get('type') || 'all';
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const tag = url.searchParams.get('tag') || '';
      let items = [];
      if (type === 'all' || type === 'recipe') items = items.concat((await repository.read('recipes')).items);
      if (type === 'all' || type === 'tea') items = items.concat((await repository.read('teas')).items);
      items = items.filter((item) => (!q || item.name.toLowerCase().includes(q)) && (!tag || item.needTags.includes(tag)));
      return json(response, 200, { items });
    }
    if ((match = pathname.match(/^\/api\/library\/(recipe|tea)\/([^/]+)$/)) && method === 'GET') {
      const store = match[1] === 'recipe' ? 'recipes' : 'teas';
      const item = (await repository.read(store)).items.find((entry) => entry.id === decodeURIComponent(match[2]));
      if (!item) throw new ServiceError('NOT_FOUND', '未找到库条目', 404);
      return json(response, 200, { item });
    }
    if (pathname === '/api/recommendations' && method === 'GET') {
      const date = url.searchParams.get('date');
      if (!date) throw new ServiceError('VALIDATION_ERROR', '缺少日期', 400);
      return json(response, 200, await recommendationService.get({ date, scope: url.searchParams.get('scope') || 'all' }));
    }
    if (pathname === '/api/recommendations/rotate' && method === 'POST') {
      return json(response, 200, await recommendationService.rotate(await parseJson(request)));
    }
    if (pathname === '/api/recommendation-history' && method === 'GET') {
      return json(response, 200, { entries: await recommendationService.history({ date: url.searchParams.get('date'), scope: url.searchParams.get('scope') || 'all' }) });
    }
    if (pathname === '/api/tongue-records' && method === 'GET') {
      return json(response, 200, { records: await tongueService.list(url.searchParams.get('memberId')) });
    }
    if (pathname === '/api/tongue-records' && method === 'POST') {
      const { fields, file } = await parseMultipart(request);
      const input = {
        ...fields,
        observations: decodeJsonField(fields.observations, {}),
        confirmedTags: decodeJsonField(fields.confirmedTags, []),
      };
      return json(response, 201, { record: await tongueService.create(input, file) });
    }
    if ((match = pathname.match(/^\/api\/tongue-records\/([^/]+)\/(confirm|archive|restore)$/)) && method === 'POST') {
      const id = decodeURIComponent(match[1]);
      const action = match[2];
      return json(response, 200, { record: await tongueService[action](id) });
    }
    if ((match = pathname.match(/^\/api\/tongue-records\/([^/]+)$/))) {
      const id = decodeURIComponent(match[1]);
      if (method === 'GET') return json(response, 200, { record: await tongueService.get(id) });
      if (method === 'PATCH') return json(response, 200, { record: await tongueService.update(id, await parseJson(request)) });
      if (method === 'DELETE') { await tongueService.remove(id); return noContent(response); }
    }
    throw new ServiceError('NOT_FOUND', '未找到请求的资源', 404);
  }

  async function serveStatic(response, pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch (_) { throw new ServiceError('NOT_FOUND', '路径不正确', 404); }
    if (decoded.includes('..') || decoded.includes('\\')) throw new ServiceError('NOT_FOUND', '路径不正确', 404);
    let base = publicDir;
    let relative = decoded === '/' ? 'index.html' : decoded.replace(/^\//, '');
    if (relative.startsWith('uploads/')) {
      base = dataDir;
      if (!/^uploads\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(relative)) throw new ServiceError('NOT_FOUND', '路径不正确', 404);
    }
    const file = path.resolve(base, relative);
    const root = path.resolve(base);
    if (!file.startsWith(`${root}${path.sep}`) && file !== root) throw new ServiceError('NOT_FOUND', '路径不正确', 404);
    let stat;
    try { stat = await fs.promises.stat(file); } catch (_) { throw new ServiceError('NOT_FOUND', '页面不存在', 404); }
    if (!stat.isFile()) throw new ServiceError('NOT_FOUND', '页面不存在', 404);
    response.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': stat.size });
    fs.createReadStream(file).pipe(response);
  }

  async function handler(request, response) {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await routeApi(request, response, url);
      else if (request.method === 'GET') await serveStatic(response, url.pathname);
      else throw new ServiceError('NOT_FOUND', '未找到请求的资源', 404);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const status = error.status || (error instanceof ValidationError ? 400 : 500);
      json(response, status, {
        code: error.code || (error instanceof ValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'),
        message: status === 500 ? '本地服务发生错误' : error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
  }

  return { init, handler, repository, services: { familyService, tongueService, recommendationService } };
}

module.exports = { createApp };
