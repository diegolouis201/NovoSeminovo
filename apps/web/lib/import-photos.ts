// Fotos trazidas pela extensão do Chrome: chegam como imagens prontas (não
// links), grandes demais para o sessionStorage. Ficam no IndexedDB até o
// passo a passo abrir (ver takeImportedPhotos em WizardParts).
const DB = "ns-importar";
const STORE = "fotos";
const KEY = "atual";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function saveImportedPhotoBlobs(blobs: Blob[]): Promise<IDBValidKey> {
  return run("readwrite", (store) => store.put(blobs, KEY));
}

export async function takeImportedPhotoBlobs(): Promise<Blob[]> {
  const blobs = (await run<Blob[] | undefined>("readonly", (store) => store.get(KEY))) ?? [];
  await run("readwrite", (store) => store.delete(KEY));
  return blobs;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
