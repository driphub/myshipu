import { validateAndNormalizeState } from './static-schema.mjs';

const DATABASE_NAME = 'mingyuan-static';
const STORE_NAME = 'state';
const STATE_KEY = 'app';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function storageError(error) {
  if (error?.code === 'VALIDATION_ERROR') return error;
  const quota = error?.name === 'QuotaExceededError';
  const wrapped = new Error(quota ? '浏览器存储空间不足，请导出备份后清理站点数据' : '无法访问浏览器本地数据库');
  wrapped.code = quota ? 'STORAGE_QUOTA' : 'STORAGE_UNAVAILABLE';
  wrapped.status = quota ? 507 : 503;
  return wrapped;
}

export function createIndexedDbBackend(indexedDb = globalThis.indexedDB) {
  let databasePromise;

  function open() {
    if (!indexedDb) return Promise.reject(storageError());
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(storageError(request.error));
        request.onblocked = () => reject(storageError(request.error));
      });
    }
    return databasePromise;
  }

  return {
    async read() {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
        request.onsuccess = () => resolve(clone(request.result));
        request.onerror = () => reject(storageError(request.error));
      });
    },

    async transact(mutator) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(STATE_KEY);
        let result;
        request.onsuccess = () => {
          try {
            result = mutator(clone(request.result));
            if (result && typeof result.then === 'function') throw new Error('IndexedDB 事务更新必须同步完成');
            store.put(clone(result), STATE_KEY);
          } catch (error) {
            reject(error);
            transaction.abort();
          }
        };
        request.onerror = () => reject(storageError(request.error));
        transaction.oncomplete = () => resolve(clone(result));
        transaction.onerror = () => reject(storageError(transaction.error));
        transaction.onabort = () => {
          if (transaction.error) reject(storageError(transaction.error));
        };
      });
    },
  };
}

let bootstrapPromise;

export function loadBootstrap() {
  if (!bootstrapPromise) {
    const url = new URL('assets/data/seed-data.json', document.baseURI);
    bootstrapPromise = fetch(url).then((response) => {
      if (!response.ok) throw new Error('无法载入静态初始化数据');
      return response.json();
    });
  }
  return bootstrapPromise;
}

export function createStateStore({ backend, loadBootstrap: bootstrapLoader }) {
  let initialization;

  function ensureInitialized() {
    if (!initialization) {
      initialization = bootstrapLoader().then((bootstrap) => backend.transact((current) => {
        if (current) return current;
        return validateAndNormalizeState(bootstrap.state, bootstrap.taxonomy);
      }).then(() => bootstrap)).catch((error) => {
        initialization = undefined;
        throw storageError(error);
      });
    }
    return initialization;
  }

  return {
    async read() {
      await ensureInitialized();
      return backend.read();
    },

    async update(mutator) {
      const bootstrap = await ensureInitialized();
      return backend.transact((current) => {
        const draft = clone(current);
        const changed = mutator(draft) || draft;
        const normalized = validateAndNormalizeState(changed, bootstrap.taxonomy);
        normalized.revision = current.revision + 1;
        return normalized;
      });
    },

    async replaceImported(imported) {
      const bootstrap = await ensureInitialized();
      const normalizedImport = validateAndNormalizeState(imported, bootstrap.taxonomy, { imported: true });
      return backend.transact((current) => {
        const normalized = validateAndNormalizeState(normalizedImport, bootstrap.taxonomy);
        normalized.revision = current.revision + 1;
        return normalized;
      });
    },

    bootstrap: ensureInitialized,
  };
}

export const browserStore = createStateStore({
  backend: createIndexedDbBackend(),
  loadBootstrap,
});
