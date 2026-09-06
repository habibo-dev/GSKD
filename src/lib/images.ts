import { promises as fs } from "fs";
import path from "path";
import { db } from "@/db";
import { images, parts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { safeFilename } from "@/lib/normalize";
import { imageUrl } from "@/lib/img-url";

export { imageUrl };

// ---------------------------------------------------------------------------
// Gestion des images produits : une image canonique par pièce, stockée une
// seule fois dans /uploads/parts et servie via /api/images/parts/<fichier>
// ---------------------------------------------------------------------------

export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
export const PARTS_DIR = path.join(UPLOADS_ROOT, "parts");

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo

async function ensureDir() {
  await fs.mkdir(PARTS_DIR, { recursive: true });
}

export async function savePartImage(
  partId: number,
  file: File,
): Promise<{ filename: string }> {
  const [part] = await db.select().from(parts).where(eq(parts.id, partId));
  if (!part) throw new Error("Pièce introuvable.");

  const ext = MIME_EXT[file.type];
  if (!ext) {
    throw new Error("Format non pris en charge (JPEG, PNG ou WebP requis).");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("Image trop volumineuse (8 Mo maximum).");
  }

  await ensureDir();
  const buffer = Buffer.from(await file.arrayBuffer());

  // Supprime l'ancien fichier si présent
  const [existing] = await db
    .select()
    .from(images)
    .where(eq(images.partId, partId));
  if (existing) {
    await fs.rm(path.join(PARTS_DIR, existing.filename), { force: true });
  }

  const filename = `${partId}-${safeFilename(part.reference)}${ext}`;
  await fs.writeFile(path.join(PARTS_DIR, filename), buffer);

  await db
    .insert(images)
    .values({
      partId,
      filename,
      originalName: file.name,
      mime: file.type,
      size: file.size,
    })
    .onConflictDoUpdate({
      target: images.partId,
      set: {
        filename,
        originalName: file.name,
        mime: file.type,
        size: file.size,
        updatedAt: new Date(),
      },
    });
  return { filename };
}

export async function deletePartImage(partId: number) {
  const [existing] = await db
    .select()
    .from(images)
    .where(eq(images.partId, partId));
  if (!existing) return;
  await fs.rm(path.join(PARTS_DIR, existing.filename), { force: true });
  await db.delete(images).where(eq(images.partId, partId));
}

/** Associe un fichier déjà présent sur le disque (ex: images de démonstration). */
export async function linkExistingFile(
  partId: number,
  filename: string,
  originalName?: string,
) {
  await db
    .insert(images)
    .values({
      partId,
      filename,
      originalName: originalName ?? filename,
      mime: filename.endsWith(".png") ? "image/png" : "image/jpeg",
      size: null,
    })
    .onConflictDoNothing();
}
