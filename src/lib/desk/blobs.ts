const DB_NAME = "lee-deal-files";
const STORE = "blobs";

type Row = { id: string; packetId: string; blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("packetId", "packetId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open file storage."));
  });
}

function finish(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("File storage failed."));
    tx.onabort = () => reject(tx.error ?? new Error("File storage was aborted."));
  });
}

export async function putBlob(packetId: string, id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, packetId, blob } satisfies Row);
    await finish(tx);
  } finally {
    db.close();
  }
}

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await new Promise<Row | undefined>((resolve, reject) => {
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result as Row | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read the file."));
    });
    await finish(tx);
    return row?.blob ?? null;
  } finally {
    db.close();
  }
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await finish(tx);
  } finally {
    db.close();
  }
}

export async function deletePacketBlobs(packetId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const request = tx.objectStore(STORE).index("packetId").openCursor(IDBKeyRange.only(packetId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await finish(tx);
  } finally {
    db.close();
  }
}
