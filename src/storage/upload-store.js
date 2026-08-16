const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ServiceError } = require('../services/errors');

const EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

class UploadStore {
  constructor({ dataDir, maxBytes = 5 * 1024 * 1024, idGenerator } = {}) {
    this.dataDir = dataDir;
    this.maxBytes = maxBytes;
    this.idGenerator = idGenerator || (() => crypto.randomBytes(16).toString('hex'));
  }

  async save({ buffer, mimeType }) {
    const extension = EXTENSIONS[mimeType];
    if (!extension) throw new ServiceError('UNSUPPORTED_MEDIA_TYPE', '仅支持 JPG、PNG 或 WebP 图片', 415);
    if (!Buffer.isBuffer(buffer) || buffer.length > this.maxBytes) {
      throw new ServiceError('PAYLOAD_TOO_LARGE', '图片不能超过 5MB', 413);
    }
    const uploadsDir = path.join(this.dataDir, 'uploads');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const fileName = `${this.idGenerator()}.${extension}`;
    await fs.promises.writeFile(path.join(uploadsDir, fileName), buffer);
    return `uploads/${fileName}`;
  }

  async remove(relativePath) {
    if (!relativePath) return;
    const normalized = String(relativePath).replace(/\\/g, '/');
    if (!/^uploads\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(normalized)) {
      throw new ServiceError('INVALID_UPLOAD_PATH', '图片路径不合法', 400);
    }
    await fs.promises.unlink(path.join(this.dataDir, normalized)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  async cleanup(referencedPaths) {
    const uploadsDir = path.join(this.dataDir, 'uploads');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const referenced = new Set(referencedPaths || []);
    for (const file of await fs.promises.readdir(uploadsDir)) {
      const relative = `uploads/${file}`;
      if (!referenced.has(relative)) await this.remove(relative);
    }
  }
}

module.exports = { UploadStore };
