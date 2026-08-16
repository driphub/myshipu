const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class JsonRepository {
  constructor({ dataDir, seedData, validators = {} }) {
    this.dataDir = dataDir;
    this.seedData = seedData;
    this.validators = validators;
    this.queue = Promise.resolve();
    this.warnings = [];
  }

  async init() {
    await fs.promises.mkdir(this.dataDir, { recursive: true });
    await fs.promises.mkdir(path.join(this.dataDir, 'uploads'), { recursive: true });
    await fs.promises.mkdir(path.join(this.dataDir, '.trash'), { recursive: true });
    await this._recoverTransaction();
    await this._cleanupTrash();
    for (const [name, value] of Object.entries(this.seedData)) {
      const file = this._path(name);
      if (!fs.existsSync(file)) await this._writeFresh(file, value);
    }
  }

  consumeWarnings() {
    return this.warnings.splice(0);
  }

  async read(name) {
    return this._readNow(name);
  }

  async write(name, value) {
    return this._enqueue(() => this._writeNow(name, value));
  }

  async update(name, updater) {
    return this._enqueue(async () => {
      const current = await this._readNow(name);
      return this._writeNow(name, await updater(current));
    });
  }

  async writeBatch(changes, fileMoves = []) {
    return this._enqueue(() => this._writeBatchNow(changes, fileMoves));
  }

  async transaction(names, updater) {
    return this._enqueue(async () => {
      const current = {};
      for (const name of names) current[name] = await this._readNow(name);
      const outcome = await updater(current);
      if (outcome && outcome.changes) await this._writeBatchNow(outcome.changes, outcome.fileMoves || []);
      return outcome && Object.prototype.hasOwnProperty.call(outcome, 'result') ? outcome.result : outcome;
    });
  }

  async _writeBatchNow(changes, fileMoves = []) {
      const transactionId = crypto.randomBytes(8).toString('hex');
      const names = Object.keys(changes);
      for (const name of names) this._validate(name, changes[name]);
      const journalPath = path.join(this.dataDir, '.transaction.json');
      const stagedMoves = fileMoves.map((relativePath) => this._stagedMove(transactionId, relativePath));
      const journal = {
        transactionId,
        names,
        fileMoves: stagedMoves.map(({ relativePath, trashRelativePath }) => ({ relativePath, trashRelativePath })),
      };
      const temps = [];
      try {
        for (const name of names) {
          const target = this._path(name);
          const backup = `${target}.bak`;
          const temp = `${target}.${transactionId}.tmp`;
          if (fs.existsSync(target)) await fs.promises.copyFile(target, backup);
          await fs.promises.writeFile(temp, `${JSON.stringify(changes[name], null, 2)}\n`, 'utf8');
          temps.push({ temp, target });
        }
        await fs.promises.writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
        for (const move of stagedMoves) {
          if (!fs.existsSync(move.source)) continue;
          await fs.promises.mkdir(path.dirname(move.trash), { recursive: true });
          await fs.promises.rename(move.source, move.trash);
        }
        for (const entry of temps) await fs.promises.rename(entry.temp, entry.target);
        await fs.promises.unlink(journalPath);
        await fs.promises.rm(path.join(this.dataDir, '.trash', transactionId), { recursive: true, force: true });
        return changes;
      } catch (error) {
        await this._rollback(names, journal.fileMoves);
        throw error;
      }
  }

  _enqueue(task) {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => {});
    return result;
  }

  _path(name) {
    if (!Object.prototype.hasOwnProperty.call(this.seedData, name)) throw new Error(`Unknown data store: ${name}`);
    return path.join(this.dataDir, `${name}.json`);
  }

  _validate(name, value) {
    if (this.validators[name]) this.validators[name](value);
  }

  _stagedMove(transactionId, relativePath) {
    const normalized = String(relativePath || '').replace(/\\/g, '/');
    if (!/^uploads\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(normalized)) {
      throw new Error(`Invalid transaction file path: ${relativePath}`);
    }
    const trashRelativePath = `.trash/${transactionId}/${path.basename(normalized)}`;
    return {
      relativePath: normalized,
      trashRelativePath,
      source: path.join(this.dataDir, normalized),
      trash: path.join(this.dataDir, trashRelativePath),
    };
  }

  async _readNow(name) {
    const file = this._path(name);
    const source = await fs.promises.readFile(file, 'utf8');
    try {
      const value = JSON.parse(source);
      this._validate(name, value);
      return value;
    } catch (error) {
      const backup = `${file}.bak`;
      const recovered = JSON.parse(await fs.promises.readFile(backup, 'utf8'));
      this._validate(name, recovered);
      const temp = `${file}.recovery.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(temp, `${JSON.stringify(recovered, null, 2)}\n`, 'utf8');
      await fs.promises.rename(temp, file);
      this.warnings.push({ code: 'RECOVERED_FROM_BACKUP', store: name, message: `${name}.json 已从备份恢复读取` });
      return recovered;
    }
  }

  async _writeNow(name, value) {
    this._validate(name, value);
    const target = this._path(name);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    if (fs.existsSync(target)) await fs.promises.copyFile(target, `${target}.bak`);
    await fs.promises.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temp, target);
    return value;
  }

  async _writeFresh(file, value) {
    await fs.promises.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  async _rollback(names, fileMoves = []) {
    for (const name of names) {
      const target = this._path(name);
      const backup = `${target}.bak`;
      if (fs.existsSync(backup)) await fs.promises.copyFile(backup, target);
    }
    for (const move of fileMoves) {
      const source = path.join(this.dataDir, move.relativePath);
      const trash = path.join(this.dataDir, move.trashRelativePath);
      if (!fs.existsSync(trash)) continue;
      await fs.promises.mkdir(path.dirname(source), { recursive: true });
      await fs.promises.rename(trash, source);
    }
    const journalPath = path.join(this.dataDir, '.transaction.json');
    if (fs.existsSync(journalPath)) await fs.promises.unlink(journalPath);
  }

  async _recoverTransaction() {
    const journalPath = path.join(this.dataDir, '.transaction.json');
    if (!fs.existsSync(journalPath)) return;
    const journal = JSON.parse(await fs.promises.readFile(journalPath, 'utf8'));
    await this._rollback(journal.names || [], journal.fileMoves || []);
    this.warnings.push({ code: 'RECOVERED_TRANSACTION', message: '未完成的数据事务已回滚' });
  }

  async _cleanupTrash() {
    const trashDir = path.join(this.dataDir, '.trash');
    for (const entry of await fs.promises.readdir(trashDir)) {
      await fs.promises.rm(path.join(trashDir, entry), { recursive: true, force: true });
    }
  }
}

module.exports = { JsonRepository };
