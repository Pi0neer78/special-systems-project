// Хранение "дескриптора файла" ключа доступа (File System Access API) в IndexedDB,
// чтобы при следующих входах не запрашивать файл заново (поддерживается в Chrome/Edge).
// В браузерах без поддержки API просто нет возможности запомнить путь — пользователь
// будет выбирать файл через обычный <input type="file"> каждый раз.

const DB_NAME = 'work_panel_key_store';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

export async function saveKeyFileHandle(login: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, login.toLowerCase());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getKeyFileHandle(login: string): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const result = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(login.toLowerCase());
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function clearKeyFileHandle(login: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(login.toLowerCase());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Пытается прочитать ключ по сохранённому дескриптору без диалога.
// Возвращает null, если дескриптора нет или доступ не подтверждён (тогда нужен showOpenFilePicker).
export async function tryReadStoredKey(login: string): Promise<string | null> {
  try {
    const handle = await getKeyFileHandle(login);
    if (!handle) return null;
    const permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') return null;
    const file = await handle.getFile();
    return (await file.text()).trim();
  } catch {
    return null;
  }
}

// Открывает системный диалог выбора файла, сохраняет дескриптор для следующих входов
// (если поддерживается) и возвращает содержимое ключа.
export async function pickAndReadKey(login: string): Promise<string | null> {
  if (isFileSystemAccessSupported()) {
    try {
      const [handle] = await window.showOpenFilePicker!({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [{ description: 'Файл ключа', accept: { 'text/plain': ['.txt'] } }],
      });
      await saveKeyFileHandle(login, handle);
      const file = await handle.getFile();
      return (await file.text()).trim();
    } catch {
      return null;
    }
  }
  return null;
}

// Fallback через обычный input[type=file] для браузеров без File System Access API.
export function pickKeyViaInput(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve((await file.text()).trim());
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
