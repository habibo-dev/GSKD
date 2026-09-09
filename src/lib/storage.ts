import { promises as fs } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Couche de stockage objet (images produits + artefacts d'import PDF).
//
// Vercel Functions n'ont PAS de système de fichiers persistant : seul `/tmp`
// est inscriptible mais il est éphémère et local à une instance. Écrire dans
// `uploads/` sous le cwd échoue donc en production (ENOENT `/var/task/uploads`).
//
// Deux backends :
//   "fs"   → dossier local `uploads/` (dev / tests, comportement historique).
//   "blob" → Vercel Blob, activé dès que BLOB_READ_WRITE_TOKEN est fourni
//            (stockage objet persistant & partagé sur Vercel).
//
// Le backend est choisi une fois au chargement du module (stable par process).
// ---------------------------------------------------------------------------

export type StorageMode = "fs" | "blob";

export const STORAGE_MODE: StorageMode = process.env.BLOB_READ_WRITE_TOKEN
  ? "blob"
  : "fs";

/** Racine locale (backend fs uniquement). */
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
export const PARTS_DIR = path.join(UPLOADS_ROOT, "parts");
export const PDF_IMPORT_ROOT = path.join(UPLOADS_ROOT, "pdf-import");

function localPathFor(key: string): string {
  const p = path.join(UPLOADS_ROOT, key);
  if (!p.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error("Clé de stockage invalide.");
  }
  return p;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

export function mimeFromName(name: string): string {
  const base = String(name).split("?")[0];
  return MIME_BY_EXT[path.extname(base).toLowerCase()] ?? "application/octet-stream";
}

/** Nettoye une clé pour Vercel Blob (chemins normalisés, sans montée). */
function assertSafeKey(key: string): string {
  if (!key || key.includes("..") || key.includes("\0") || key.startsWith("/")) {
    throw new Error("Clé de stockage invalide.");
  }
  return key.replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
async function writeFs(key: string, data: Buffer, mime: string): Promise<void> {
  const p = localPathFor(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}

async function writeBlob(key: string, data: Buffer, mime: string): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(assertSafeKey(key), data, {
    // Objets « privés » : jamais accessibles publiquement. Ils ne sont servis
    // que par nos routes serveur (/api/images/parts, /api/pdf/files) qui
    // passent par la couche storage. Les clés reflètent uploads/<key> (les
    // images n'étaient pas non plus exposées en statique auparavant).
    access: "private",
    contentType: mime,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function storageWrite(
  key: string,
  data: Buffer,
  mime?: string,
): Promise<void> {
  const mt = mime ?? mimeFromName(key);
  if (STORAGE_MODE === "blob") return writeBlob(key, data, mt);
  return writeFs(key, data, mt);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------
export type StoredObject = { data: Buffer; mime: string };

async function readFs(key: string): Promise<StoredObject | null> {
  const p = localPathFor(key);
  try {
    const data = await fs.readFile(p);
    return { data, mime: mimeFromName(p) };
  } catch {
    return null;
  }
}

async function readBlob(key: string): Promise<StoredObject | null> {
  const { get } = await import("@vercel/blob");
  const res = await get(assertSafeKey(key), { access: "private" });
  if (!res || !res.stream) return null;
  const chunks: Buffer[] = [];
  const reader = res.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return {
    data: Buffer.concat(chunks),
    mime: res.blob.contentType || mimeFromName(key),
  };
}

export async function storageRead(key: string): Promise<StoredObject | null> {
  if (STORAGE_MODE === "blob") {
    try {
      const obj = await readBlob(key);
      if (obj) return obj;
    } catch {
      // repli ci-dessous
    }
  }
  return readFs(key);
}

export async function storageExists(key: string): Promise<boolean> {
  return (await storageRead(key)) !== null;
}

export async function storageDelete(key: string): Promise<void> {
  try {
    if (STORAGE_MODE === "blob") {
      const { del } = await import("@vercel/blob");
      await del(assertSafeKey(key));
    }
  } catch {
    // best-effort
  }
  try {
    await fs.rm(localPathFor(key), { force: true });
  } catch {
    // ignore
  }
}

/** Liste les clés sous un préfixe (utilisé pour purger / lister). */
export async function storageList(prefix: string): Promise<string[]> {
  const norm = prefix.replace(/\\/g, "/").replace(/\/+$/, "");
  if (STORAGE_MODE === "blob") {
    const { list } = await import("@vercel/blob");
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({
        prefix: norm ? `${norm}/` : undefined,
        cursor,
      });
      for (const b of res.blobs) out.push(b.pathname);
      cursor = res.cursor;
    } while (cursor);
    return out;
  }
  // mode fs : parcours récursif
  const root = localPathFor(norm);
  const out: string[] = [];
  try {
    const walk = async (dir: string, rel: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(full, r);
        else out.push(norm ? `${norm}/${r}` : r);
      }
    };
    await walk(root, "");
  } catch {
    // dossier absent
  }
  return out;
}

/** Supprime tous les objets sous un préfixe (purge d'un lot d'import / pièce). */
export async function storageDeletePrefix(prefix: string): Promise<void> {
  const keys = await storageList(prefix);
  for (const k of keys) await storageDelete(k);
}
