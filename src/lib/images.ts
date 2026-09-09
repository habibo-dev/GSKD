import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { images, imageVersions, parts } from "@/db/schema";
import { safeFilename } from "@/lib/normalize";
import { imageUrl } from "@/lib/img-url";
import { STORAGE_MODE, PARTS_DIR, storageWrite, storageExists } from "@/lib/storage";

export { imageUrl, STORAGE_MODE, PARTS_DIR };

// ---------------------------------------------------------------------------
// Gestion des images produits — UNE image canonique par pièce.
//
// RÉVERSIBILITÉ : chaque affectation d'une photo (catalogue PDF, téléversement
// manuel, restauration) crée une nouvelle VERSION et archive la précédente dans
// `image_versions`. Le fichier sur disque de chaque version est conservé (jamais
// écrasé ni supprimé immédiatement) : la photo courante peut donc être remplacée
// ou restaurée à tout moment, et chaque choix reste tracé/auditable.
//
//  - `images`          : pointe UNIQUEMENT la version courante (utilisée telle
//                        quelle par toute l'app : recherche, stock, fiche,
//                        ventes, catalogue & exports).
//  - `image_versions`  : journal immuable des versions + provenance.
// ---------------------------------------------------------------------------

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo

/** Clé de stockage objet d'une image de pièce. */
export function partObjectKey(filename: string): string {
  return `parts/${filename}`;
}

export type ImageSource =
  | "upload"
  | "pdf_extract"
  | "seed"
  | "restore"
  | "import";

type CommitInput = {
  buffer: Buffer;
  mime: string;
  originalName?: string;
  source: ImageSource;
  token?: string | null;
  sourceRel?: string | null;
  pdfPage?: number | null;
  pdfReference?: string | null;
  confidence?: string | null;
  note?: string | null;
};

/**
 * Affecte une image comme nouvelle photo canonique d'une pièce.
 * - n'écrase JAMAIS un fichier existant (nom de fichier unique par version),
 * - archive la version précédente dans `image_versions` (récupérable),
 * - met à jour la ligne `images` qui sert d'image courante partout.
 */
async function commitImageBuffer(
  partId: number,
  input: CommitInput,
): Promise<{ filename: string; versionNo: number }> {
  const [part] = await db
    .select()
    .from(parts)
    .where(eq(parts.id, partId));
  if (!part) throw new Error("Pièce introuvable.");

  const ext = MIME_EXT[input.mime];
  if (!ext) {
    throw new Error("Format non pris en charge (JPEG, PNG ou WebP requis).");
  }

  // Version(s) déjà archivées pour cette pièce.
  const existingVers = await db
    .select({ versionNo: imageVersions.versionNo })
    .from(imageVersions)
    .where(eq(imageVersions.partId, partId));
  const currentImg = (
    await db.select().from(images).where(eq(images.partId, partId))
  )[0];

  // Base de numérotation.
  let base = existingVers.length
    ? Math.max(...existingVers.map((v) => v.versionNo))
    : 0;

  // Si une image canonique préexistante n'a JAMAIS été archivée (ex: images
  // posées directement dans `images` avant ce mécanisme), on l'archive comme
  // « version 1 » afin de ne jamais perdre l'image remplacée.
  if (base === 0 && currentImg) {
    await db
      .insert(imageVersions)
      .values({
        partId,
        versionNo: 1,
        filename: currentImg.filename,
        originalName: currentImg.originalName ?? currentImg.filename,
        mime: currentImg.mime ?? "image/png",
        size: currentImg.size,
        source: currentImg.filename.startsWith("demo-") ? "seed" : "import",
        isCurrent: false,
        createdAt: currentImg.updatedAt ?? new Date(),
      })
      .onConflictDoNothing();
    base = 1;
  }

  const versionNo = base + 1;

  // Nom unique garanti (jamais d'écrasement de fichier).
  const rand = crypto.randomBytes(3).toString("hex");
  const filename = `${partId}-${safeFilename(part.reference)}-v${versionNo}-${rand}${ext}`;

  await storageWrite(partObjectKey(filename), input.buffer, input.mime);

  const now = new Date();
  const originalName = input.originalName ?? filename;

  // Archive : seule la nouvelle version est courante.
  await db
    .update(imageVersions)
    .set({ isCurrent: false })
    .where(eq(imageVersions.partId, partId));
  await db
    .insert(imageVersions)
    .values({
      partId,
      versionNo,
      filename,
      originalName,
      mime: input.mime,
      size: input.buffer.length,
      source: input.source,
      token: input.token ?? null,
      sourceRel: input.sourceRel ?? null,
      pdfPage: input.pdfPage ?? null,
      pdfReference: input.pdfReference ?? null,
      confidence: input.confidence ?? null,
      note: input.note ?? null,
      isCurrent: true,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [imageVersions.partId, imageVersions.versionNo],
      set: {
        filename,
        originalName,
        mime: input.mime,
        size: input.buffer.length,
        source: input.source,
        token: input.token ?? null,
        sourceRel: input.sourceRel ?? null,
        pdfPage: input.pdfPage ?? null,
        pdfReference: input.pdfReference ?? null,
        confidence: input.confidence ?? null,
        note: input.note ?? null,
        isCurrent: true,
      },
    });

  // Pointeur courant utilisé partout.
  await db
    .insert(images)
    .values({
      partId,
      filename,
      originalName,
      mime: input.mime,
      size: input.buffer.length,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: images.partId,
      set: {
        filename,
        originalName,
        mime: input.mime,
        size: input.buffer.length,
        updatedAt: now,
      },
    });

  return { filename, versionNo };
}

/** Téléversement manuel (voie « Changer la photo ») depuis un File. */
export async function savePartImage(
  partId: number,
  file: File,
): Promise<{ filename: string }> {
  const ext = MIME_EXT[file.type];
  if (!ext) {
    throw new Error("Format non pris en charge (JPEG, PNG ou WebP requis).");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("Image trop volumineuse (8 Mo maximum).");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const { filename } = await commitImageBuffer(partId, {
    buffer,
    mime: file.type,
    originalName: file.name,
    source: "upload",
  });
  return { filename };
}

/** Accepte une découpe photo du catalogue PDF comme photo canonique. */
export async function applyPdfCrop(
  partId: number,
  buffer: Buffer,
  opts: {
    token: string;
    sourceRel: string;
    reference?: string;
    pdfPage?: number;
    pdfReference?: string;
    confidence?: string;
  },
): Promise<{ filename: string; versionNo: number }> {
  const [part] = await db
    .select()
    .from(parts)
    .where(eq(parts.id, partId));
  const ref = opts.reference ?? part?.reference ?? String(partId);
  const pdfRef = opts.pdfReference ?? opts.reference ?? part?.reference ?? String(partId);
  return commitImageBuffer(partId, {
    buffer,
    mime: "image/png",
    originalName: `${ref} (extrait PDF ${opts.sourceRel})`,
    source: "pdf_extract",
    token: opts.token,
    sourceRel: opts.sourceRel,
    pdfPage: opts.pdfPage ?? null,
    pdfReference: pdfRef,
    confidence: opts.confidence ?? null,
  });
}

/**
 * Retire la photo canonique d'une pièce SANS détruire l'archivage : le fichier
 * de la version en cours et son enregistrement dans `image_versions` restent
 * disponibles pour être restaurés à tout moment.
 */
export async function deletePartImage(partId: number): Promise<void> {
  await db.delete(images).where(eq(images.partId, partId));
  await db
    .update(imageVersions)
    .set({ isCurrent: false })
    .where(eq(imageVersions.partId, partId));
}

export type ImageVersionView = {
  id: number;
  versionNo: number;
  filename: string;
  originalName: string | null;
  mime: string | null;
  size: number | null;
  source: string;
  token: string | null;
  sourceRel: string | null;
  pdfPage: number | null;
  pdfReference: string | null;
  confidence: string | null;
  note: string | null;
  isCurrent: boolean;
  createdAt: Date;
  url: string;
};

/** Historique des versions d'une pièce (provenance + aperçu), plus récent d'abord. */
export async function getPartImageVersions(
  partId: number,
): Promise<ImageVersionView[]> {
  const rows = await db
    .select()
    .from(imageVersions)
    .where(eq(imageVersions.partId, partId))
    .orderBy(desc(imageVersions.versionNo));
  return rows.map((v) => ({
    id: v.id,
    versionNo: v.versionNo,
    filename: v.filename,
    originalName: v.originalName,
    mime: v.mime,
    size: v.size,
    source: v.source,
    token: v.token,
    sourceRel: v.sourceRel,
    pdfPage: v.pdfPage,
    pdfReference: v.pdfReference,
    confidence: v.confidence,
    note: v.note,
    isCurrent: v.isCurrent,
    createdAt: v.createdAt,
    url: imageUrl(v.filename, v.createdAt),
  }));
}

/** Rétablit une version antérieure comme photo canonique (réversibilité). */
export async function restorePartImageVersion(
  partId: number,
  versionId: number,
): Promise<{ filename: string }> {
  const [v] = await db
    .select()
    .from(imageVersions)
    .where(
      and(
        eq(imageVersions.partId, partId),
        eq(imageVersions.id, versionId),
      ),
    );
  if (!v) throw new Error("Version introuvable.");
  // Le fichier/objet de chaque version est conservé : on ne réécrit rien.
  if (!(await storageExists(partObjectKey(v.filename)))) {
    throw new Error("Le fichier de cette version n'est plus disponible.");
  }

  const now = new Date();
  await db
    .update(imageVersions)
    .set({ isCurrent: false })
    .where(eq(imageVersions.partId, partId));
  await db
    .update(imageVersions)
    .set({ isCurrent: true })
    .where(eq(imageVersions.id, versionId));

  await db
    .insert(images)
    .values({
      partId,
      filename: v.filename,
      originalName: v.originalName ?? v.filename,
      mime: v.mime ?? "image/png",
      size: v.size,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: images.partId,
      set: {
        filename: v.filename,
        originalName: v.originalName ?? v.filename,
        mime: v.mime ?? "image/png",
        size: v.size,
        updatedAt: now,
      },
    });

  return { filename: v.filename };
}

/**
 * Associe un fichier déjà présent sur le disque (ex: images de démonstration).
 * N'écrase jamais : si une version existe déjà pour cette pièce, on ne modifie
 * rien (l'image courante reste en place) — compatible avec l'ancien flux.
 */
export async function linkExistingFile(
  partId: number,
  filename: string,
  originalName?: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(images)
    .where(eq(images.partId, partId));
  if (existing) return; // ne pas écraser une image déjà présente

  const mime = filename.toLowerCase().endsWith(".png")
    ? "image/png"
    : filename.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  const now = new Date();
  await db.insert(images).values({
    partId,
    filename,
    originalName: originalName ?? filename,
    mime,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(imageVersions)
    .values({
      partId,
      versionNo: 1,
      filename,
      originalName: originalName ?? filename,
      mime,
      source: filename.startsWith("demo-") ? "seed" : "import",
      isCurrent: true,
      createdAt: now,
    })
    .onConflictDoNothing();
}
