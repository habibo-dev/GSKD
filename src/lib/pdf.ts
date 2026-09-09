// ---------------------------------------------------------------------------
// Analyse PDF côté serveur (runtime Node).
//
// Approche — extraction pilotée par la PHOTO (et non par l'OCR).
//
// Le catalogue PDF contient une couche texte vectorielle fiable ET, pour
// chaque ligne produit, une image photo encastrée. L'extraction procède ainsi :
//
//   1. On localise, dans chaque page, les rectangles des images produits
//      (via la pile de transformations de la liste d'opérateurs). Ces zones
//      délimitent EXACTEMENT les cellules « Photo » — jamais l'en-tête, le
//      pied de page, le compteur « x/y » ni des fragments de tableau.
//   2. On rend la page puis on recadre uniquement la zone photo de chaque
//      cellule. Le rendu applique les masques de transparence pdf.js, donc les
//      photos sortent propres (sans fond noir parasite ni bord de tableau).
//   3. La référence & la désignation sont lues dans la COUCHE TEXTE de la
//      MÊME bande de ligne que la photo → association référence/photo fiable.
//   4. Aucune association définitive n'est faite : chaque ligne reste en
//      « manual_review » tant que l'utilisateur ne l'a pas confirmée.
//
// Sorties écrites dans le stockage objet sous pdf-import/<token>/ :
//   original.pdf
//   pages/page-XX.png        (aperçu de la page, pour la galerie)
//   crops/page-XX/row-YY.png (photo produit de la ligne YY de la page XX)
// ---------------------------------------------------------------------------

import path from "path";
import crypto from "crypto";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { PDF_IMPORT_ROOT, storageWrite } from "@/lib/storage";

export { PDF_IMPORT_ROOT };

export type PdfPageImage = { pageNo: number; rel: string };

export type PdfRow = {
  id: string;
  pageNo: number;
  rowIndex: number;
  referenceRaw: string;
  n: string;
  designation: string;
  price: string;
  marque: string;
  confidence: "low" | "medium" | "high";
  status: "manual_review" | "no_image";
  imageRel: string | null;
};

export type PdfResult = {
  token: string;
  filename: string;
  size: number;
  numPages: number;
  ocrError: string | null;
  pages: PdfPageImage[];
  rows: PdfRow[];
};

export type AnalysePdfOptions = {
  /** Échelle de rendu utilisée pour recadrer les photos. */
  renderScale?: number;
  maxPages?: number;
  onProgress?: (message: string) => void;
};

/** Clé de stockage objet d'un artefact d'import PDF (sous pdf-import/<token>). */
export function pdfArtifactKey(token: string, rel: string): string {
  return `pdf-import/${token}/${rel.replace(/\\\\/g, "/").replace(/^\//, "")}`;
}

/** URL publique (pure) d'un artefact généré par l'analyse (page ou découpe). */
export function pdfFileUrl(token: string, rel: string): string {
  return `/api/pdf/files/${encodeURIComponent(token)}/${rel.replace(/\\/g, "/")}`;
}

// Échelle de rendu : assez élevée pour une photo nette, mais raisonnable pour
// 20 pages. Une cellule photo (~0,18 x 0,098 de page) donne ~320 x 250 px.
const RENDER_SCALE = 3;

// Garde-fous sur la taille des pages rendues / du nombre de photos.
const MAX_PAGE_RENDER_PX = 2600; // hauteur maximale d'une page rendue
const MAX_PHOTOS = 400;

// Colonnes (fractions normalisées de la largeur de page) en secours si
// l'en-tête n'est pas détectable. Paramétrées sur le catalogue client réel
// (N° / Référence / Désignation / Prix Vente / Photo / Marque).
const FALLBACK_REF_START = 0.095;
const FALLBACK_REF_END = 0.262;
const FALLBACK_DES_START = 0.262;
const FALLBACK_DES_END = 0.61;

type Rect = { x0: number; x1: number; y0: number; y1: number };
type Run = { str: string; x0: number; x1: number; yc: number };

/**
 * Multiplie deux matrices 3x3 (6-tuplets pdf) : retourne A·B.
 * Convention pdf : `transform a b c d e f` concatène B=A·T ; on applique les
 * transformations dans l'ordre où elles apparaissent.
 */
function mul(A: number[], B: number[]): number[] {
  const a = A[0],
    b = A[1],
    c = A[2],
    d = A[3],
    e = A[4],
    f = A[5];
  const g = B[0],
    h = B[1],
    i = B[2],
    j = B[3],
    k = B[4],
    l = B[5];
  return [
    a * g + c * i,
    b * g + d * i,
    a * h + c * j,
    b * h + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

const PDFJS_IMAGE_OPS = new Set([
  "paintImageXObject",
  "paintJpegXObject",
  "paintInlineImageXObject",
  "paintImageMaskXObject",
  "paintXObject",
]);

type PdfPageProxy = {
  getViewport(opts: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: Array<Record<string, unknown>> }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  render(opts: { canvas: unknown; viewport: unknown }): { promise: Promise<void> };
};

type PdfDocumentProxy = {
  numPages: number;
  getPage(n: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
};

async function openDocument(buffer: Buffer): Promise<PdfDocumentProxy> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfRoot = path.join(process.cwd(), "node_modules/pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(
    pdfRoot,
    "legacy/build/pdf.worker.mjs",
  );
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Fontes standards & cartographies CMap pour un rendu fiable.
    standardFontDataUrl: path.join(pdfRoot, "standard_fonts/"),
    cMapUrl: path.join(pdfRoot, "cmaps/"),
    cMapPacked: true,
  });
  return (await task.promise) as unknown as PdfDocumentProxy;
}

/** Lit la couche texte d'une page et la normalise en coordonnées de page. */
async function collectRuns(page: PdfPageProxy, PW: number, PH: number): Promise<Run[]> {
  const { items } = await page.getTextContent();
  const out: Run[] = [];
  for (const raw of items) {
    const it = raw as {
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    };
    const s = (it.str ?? "").trim();
    if (!s) continue;
    const t = it.transform ?? [1, 0, 0, 1, 0, 0];
    const h = it.height ?? 10;
    const x0 = t[4] / PW;
    const width = (it.width ?? 0) / PW;
    const baselineFromTop = PH - t[5];
    const yc = (baselineFromTop - h / 2) / PH;
    out.push({ str: s, x0, x1: x0 + width, yc });
  }
  return out;
}

/**
 * Localise les rectangles (normalisés) des images produits d'une page.
 * On suit la pile de transformations et on ne retient que les images qui
 * correspondent à une cellule photo : taille « cellule », centrée dans la
 * partie photo, sans occuper toute la page. Les dates / compteurs / fragments
 * sont du texte (exclus) ; l'en-tête & le pied de page n'ont pas d'image.
 */
async function collectPhotoRects(
  page: PdfPageProxy,
  PW: number,
  PH: number,
  code2name: Record<number, string>,
): Promise<Rect[]> {
  const op = await page.getOperatorList();
  const fn = op.fnArray;
  const args = op.argsArray;

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const rects: Rect[] = [];

  for (let i = 0; i < fn.length; i++) {
    const name = code2name[fn[i]] ?? "";
    const a = args[i] as number[] | undefined;
    if (name === "save") {
      stack.push(ctm.slice());
    } else if (name === "restore") {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (name === "transform" && a) {
      ctm = mul(ctm, [a[0], a[1], a[2], a[3], a[4], a[5]]);
    } else if (PDFJS_IMAGE_OPS.has(name)) {
      const [ma, mb, mc, md, me, mf] = ctm;
      const corners = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => [ma * x + mc * y + me, mb * x + md * y + mf]);
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const bx0 = Math.min(...xs) / PW;
      const bx1 = Math.max(...xs) / PW;
      const byb0 = Math.min(...ys);
      const byb1 = Math.max(...ys);
      const y0 = (PH - byb1) / PH;
      const y1 = (PH - byb0) / PH;
      const w = bx1 - bx0;
      const h = y1 - y0;
      const xc = (bx0 + bx1) / 2;
      const yc = (y0 + y1) / 2;
      // Filtre « vraie cellule photo produit » :
      //  - taille modérée (cellule, pas d'image pleine page ni icône minuscule)
      //  - centrée dans la moitié droite (colonne Photo)
      //  - dans le corps de la page (hors en-tête/pied extrêmes)
      const plausible =
        w > 0.03 && w < 0.7 && h > 0.03 && h < 0.5 && xc > 0.35 && xc < 0.95 && yc > 0.04 && yc < 0.96;
      if (plausible) rects.push({ x0: bx0, x1: bx1, y0, y1 });
    }
  }
  return rects;
}

/** Rend une page complète et retourne la canvas (pour recadrer + aperçu). */
async function renderPageCanvas(
  page: PdfPageProxy,
  scale: number,
): Promise<Canvas> {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d") as any;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await (page.render({ canvas: canvas as any, viewport: viewport as any }).promise as Promise<void>);
  return canvas;
}

/** Recadre une zone normalisée d'une canvas rendue et la retourne en PNG. */
function cropCanvas(canvas: Canvas, r: Rect, inset = 0.004): Buffer {
  const x0 = Math.max(0, (r.x0 + inset) * canvas.width);
  const y0 = Math.max(0, (r.y0 + inset) * canvas.height);
  const x1 = Math.min(canvas.width, (r.x1 - inset) * canvas.width);
  const y1 = Math.min(canvas.height, (r.y1 - inset) * canvas.height);
  const w = Math.max(8, Math.round(x1 - x0));
  const h = Math.max(8, Math.round(y1 - y0));
  const crop = createCanvas(w, h);
  const ctx = crop.getContext("2d") as any;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas as any, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
  return crop.toBuffer("image/png");
}

/** Convertit une canvas pleine page en PNG (aperçu galerie), redimensionné. */
function pagePreviewPng(canvas: Canvas, maxWidth = 760): Buffer {
  const scale = Math.min(1, maxWidth / canvas.width);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d") as any;
  ctx.drawImage(canvas as any, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
  return out.toBuffer("image/png");
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------
export async function analysePdfFile(
  buffer: Buffer,
  filename: string,
  options: AnalysePdfOptions = {},
): Promise<PdfResult> {
  const maxPages = options.maxPages ?? 0;
  const onProgress = options.onProgress;

  const token = crypto.randomUUID();
  // Le PDF source est stocké en objet (Blob en prod, uploads/ en dev). Il est
  // nécessaire jusqu'à la validation : on le conserve sous pdf-import/<token>.
  await storageWrite(pdfArtifactKey(token, "original.pdf"), buffer, "application/pdf");

  const doc = await openDocument(buffer);
  const total = doc.numPages;
  const limit = maxPages > 0 ? Math.min(maxPages, total) : total;

  // Dictionnaire code d'opérateur -> nom (utilisé pour repérer les images).
  const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const code2name: Record<number, string> = {};
  for (const [n, c] of Object.entries(
    (pdfjsModule as unknown as { OPS: Record<string, number> }).OPS,
  )) {
    code2name[c] = n;
  }

  const rows: PdfRow[] = [];
  const pageRels: PdfPageImage[] = [];

  try {
    for (let pn = 1; pn <= limit; pn++) {
      onProgress?.(`Lecture de la page ${pn}/${limit}…`);
      const page = await doc.getPage(pn);
      const vp = page.getViewport({ scale: 1 });
      const PW = vp.width;
      const PH = vp.height;

      const runs = await collectRuns(page, PW, PH);
      const photoRects = await collectPhotoRects(page, PW, PH, code2name);
      if (photoRects.length === 0) continue;

      const scale = Math.min(RENDER_SCALE, MAX_PAGE_RENDER_PX / PH);
      const canvas = await renderPageCanvas(page, scale);

      // Aperçu de la page pour la galerie.
      const pageRel = `pages/page-${String(pn).padStart(2, "0")}.png`;
      await storageWrite(pdfArtifactKey(token, pageRel), pagePreviewPng(canvas), "image/png");
      pageRels.push({ pageNo: pn, rel: pageRel });

      // Trie les photos par position verticale = ordre des lignes.
      const anchors = [...photoRects].sort((a, b) => a.y0 - b.y0);
      // Début réel de la zone de données : on exclut l'en-tête de colonnes
      // (N°, Référence, …) qui sinon contaminerait la première ligne produit.
      const tableTop = anchors[0].y0 - 0.006;

      for (let ri = 0; ri < anchors.length && rows.length < MAX_PHOTOS; ri++) {
        const a = anchors[ri];
        const rel = `crops/page-${String(pn).padStart(2, "0")}/row-${String(
          ri + 1,
        ).padStart(2, "0")}.png`;
        await storageWrite(pdfArtifactKey(token, rel), cropCanvas(canvas, a), "image/png");
        const imageRel = rel;

        // Texte de la MÊME bande de ligne que la photo (hors en-tête).
        const mid = (a.y0 + a.y1) / 2;
        const half = (a.y1 - a.y0) / 2 + 0.02;
        const lineRuns = runs.filter(
          (r) => r.yc > tableTop && Math.abs(r.yc - mid) < half,
        );

        // Colonnes N° / Référence / Désignation (bornes validées sur le réel).
        const nRun = lineRuns.find((r) => r.x0 < FALLBACK_REF_START && /^\d{1,3}$/.test(r.str));
        const refRuns = lineRuns
          .filter((r) => r.x0 >= FALLBACK_REF_START && r.x0 < FALLBACK_REF_END)
          .sort((x, y) => x.yc - y.yc || x.x0 - y.x0);
        const desRuns = lineRuns
          .filter((r) => r.x0 >= FALLBACK_DES_START && r.x0 < FALLBACK_DES_END)
          .sort((x, y) => x.yc - y.yc || x.x0 - y.x0);

        const referenceRaw = refRuns.map((r) => r.str).join(" ").trim();
        const n = nRun?.str ?? "";
        const designation = desRuns.map((r) => r.str).join(" ").trim();

        const hasRef = referenceRaw.length >= 3;
        rows.push({
          id: `${pn}-${ri + 1}`,
          pageNo: pn,
          rowIndex: ri + 1,
          referenceRaw,
          n,
          designation,
          price: "",
          marque: "",
          confidence: hasRef ? "medium" : "low",
          status: "manual_review",
          imageRel,
        });
      }
    }
  } catch (err) {
    // En cas d'échec de lecture d'une page, on conserve ce qui est déjà extrait.
    const msg = err instanceof Error ? err.message : "Erreur de lecture du PDF.";
    return {
      token,
      filename,
      size: buffer.length,
      numPages: limit,
      ocrError: msg,
      pages: pageRels,
      rows,
    };
  } finally {
    try {
      await doc.destroy();
    } catch {
      // best-effort
    }
  }

  return {
    token,
    filename,
    size: buffer.length,
    numPages: limit,
    ocrError: null,
    pages: pageRels,
    rows,
  };
}
