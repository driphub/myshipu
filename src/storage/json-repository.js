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

  async writeBatch(changes) {
    return this._enqueue(async () => {
      const transactionId = crypto.randomBytes(8).toString('hex');
      const names = Object.keys(changes);
      for (const name of names) this._validate(name, changes[name]);
      const journalPath = path.join(this.dataDir, '.transaction.json');
      const journal = { transactionId, names };
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
        for (const entry of temps) await fs.promises.rename(entry.temp, entry.target);
        await fs.promises.unlink(journalPath);
        return changes;
      } catch (error) {
        await this._rollback(names);
        throw error;
      }
    });
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

  async _readNow(name) {
    const file = this._path(name);
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const backup = `${file}.bak`;
      const recovered = JSON.parse(await fs.promises.readFile(backup, 'utf8'));
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

  async _rollback(names) {
    for (const name of names) {
      const target = this._path(name);
      const backup = `${target}.bak`;
      if (fs.existsSync(backup)) await fs.promises.copyFile(backup, target);
    }
    const journalPath = path.join(this.dataDir, '.transaction.json');
    if (fs.existsSync(journalPath)) await fs.promises.unlink(journalPath);
  }

  async _recoverTransaction() {
    const journalPath = path.join(this.dataDir, '.transaction.json');
    if (!fs.existsSync(journalPath)) return;
    const journal = JSON.parse(await fs.promises.readFile(journalPath, 'utf8'));
    await this._rollback(journal.names || []);
    this.warnings.push({ code: 'RECOVERED_TRANSACTION', message: '未完成的数据事务已回滚' });
  }
}

module.exports = { JsonRepository };
