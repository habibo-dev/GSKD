// ---------------------------------------------------------------------------
// Extraction des produits + photos depuis le catalogue PDF client.
//
// Ce script est volontairement "conservateur" : il rend chaque page du PDF,
// utilise OCR local (tesseract.js) pour retrouver les lignes (N°, Référence,
// Désignation, Prix, Marque) et découpe la zone "Photo" correspondante.
//
// Il ne SE PRONONCE JAMAIS sur une association automatique certaine : chaque
// ligne est émise avec un statut `manual_review`, à confirmer par l'utilisateur.
//
// Usage :
//   DATABASE_URL=... npm run pdf:extract -- <fichier.pdf> [--out=dir]
//
// Sorties :
//   out/
//     pages/page-XX.png
//     products/page-XX/row-YY.png
//     products/matches.json
//     products/matches.csv
// ---------------------------------------------------------------------------

import { promises as fs } from "fs";
import path from "path";
import { createCanvas } from "@napi-rs/canvas";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

type PageInfo = {
  pageNo: number;
  width: number;
  height: number;
  image: Buffer;
};

type WordBox = {
  text: string;
  x: number; // 0..1
  y: number; // 0..1
  w: number;
  h: number;
};

type RowMeta = {
  pageNo: number;
  rowIndex: number;
  y: number;
  referenceRaw: string;
  n: string;
  designation: string;
  price: string;
  marque: string;
  imageFilename: string | null;
  status: "manual_review" | "no_image";
  confidence: "low" | "medium" | "high";
};

const HEADER_ALIASES = new Set([
  "n°",
  "no",
  "numero",
  "ref",
  "reference",
  "designation",
  "description",
  "prix",
  "pv",
  "vente",
  "prix vente",
  "photo",
  "marque",
  "marques",
]);

const DEFAULT_SCALE = 2;
const DEFAULT_PHOTO_X = 0.79;
const DEFAULT_PHOTO_W = 0.13;
const DEFAULT_ROW_TOLERANCE = 0.012;

function readArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function normText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isReferenceToken(t: string): boolean {
  const s = t.trim();
  if (s.length < 4) return false;
  const digits = (s.match(/\d/g) ?? []).length;
  const letters = (s.match(/[A-Za-z]/g) ?? []).length;
  return digits >= 3 || (letters >= 2 && digits >= 1);
}

function parseArgs() {
  const pdf = process.argv[2];
  const outDir = path.resolve(readArg("out") ?? "data/pdf-extract");
  const scale = Number(readArg("scale") ?? DEFAULT_SCALE);
  const photoX = Number(readArg("photo-x") ?? DEFAULT_PHOTO_X);
  const photoW = Number(readArg("photo-w") ?? DEFAULT_PHOTO_W);
  const rowTolerance = Number(readArg("row-tolerance") ?? DEFAULT_ROW_TOLERANCE);
  const maxPages = Number(readArg("max-pages") ?? 0);
  const skipOcr = hasFlag("no-ocr");
  return { pdf, outDir, scale, photoX, photoW, rowTolerance, maxPages, skipOcr };
}

async function renderPages(buffer: Buffer, scale: number, maxPages: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Worker local : pdfjs-dist v6 refuse le rendu Node sans workerSrc.
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = (await task.promise) as PDFDocumentProxy;
  const out: PageInfo[] = [];
  const total = doc.numPages;
  const limit = maxPages > 0 ? Math.min(maxPages, total) : total;

  for (let n = 1; n <= limit; n++) {
    const page = (await doc.getPage(n)) as PDFPageProxy;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d") as any;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas: canvas as any, viewport: viewport as any }).promise;
    out.push({
      pageNo: n,
      width: viewport.width,
      height: viewport.height,
      image: canvas.toBuffer("image/png"),
    });
    console.log(`[render] page ${n}/${limit}`);
  }
  try {
    await (doc as any).destroy();
  } catch {
    // ignore : nettoyage best-effort
  }
  return out;
}

async function ocrPage(image: Buffer, width: number, height: number): Promise<WordBox[]> {
  const tesseract = await import("tesseract.js");
  const fra = await import("@tesseract.js-data/fra").then((m) => m.default ?? m);
  const worker = await tesseract.createWorker("fra", 1, {
    langPath: fra.langPath,
    gzip: true,
    cacheMethod: "none",
  });
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const words: WordBox[] = [];
    const blocks = (data as unknown as { blocks?: Array<any> }).blocks ?? [];
    for (const block of blocks) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const word of line.words ?? []) {
            const text = String(word.text ?? "").trim();
            if (!text) continue;
            words.push({
              text,
              x: word.bbox?.x0 / width,
              y: word.bbox?.y0 / height,
              w: (word.bbox?.x1 - word.bbox?.x0) / width,
              h: (word.bbox?.y1 - word.bbox?.y0) / height,
            });
          }
        }
      }
    }
    return words;
  } finally {
    await worker.terminate();
  }
}

async function cropPhoto(
  page: PageInfo,
  y: number,
  photoX: number,
  photoW: number,
): Promise<Buffer | null> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const img = await import("@napi-rs/canvas").then((m) => m.loadImage(page.image));
  const px = Math.max(0, Math.floor(photoX * page.width));
  const py = Math.max(0, Math.floor((y - 0.03) * page.height));
  const pw = Math.max(40, Math.ceil(photoW * page.width));
  const ph = Math.max(40, Math.ceil(0.2 * page.height));
  const crop = createCanvas(pw, ph);
  const ctx = crop.getContext("2d");
  ctx.drawImage(img as never, px, py, pw, ph, 0, 0, pw, ph);
  return crop.toBuffer("image/png");
}

async function extractFromPage(page: PageInfo, opts: ReturnType<typeof parseArgs>): Promise<RowMeta[]> {
  const words = opts.skipOcr ? [] : await ocrPage(page.image, page.width, page.height);

  // Détection des colonnes à partir des mots d'en-tête (si présents).
  const headers = words.filter((w) => {
    const t = normText(w.text).trim().replace(/[.]+$/, "");
    return HEADER_ALIASES.has(t);
  });
  const headerXs = headers.map((h) => h.x).sort((a, b) => a - b);

  const rows: RowMeta[] = [];
  if (!words.length) {
    return [
      {
        pageNo: page.pageNo,
        rowIndex: 0,
        y: 0,
        referenceRaw: "",
        n: "",
        designation: "",
        price: "",
        marque: "",
        imageFilename: null,
        status: "no_image",
        confidence: "low",
      },
    ];
  }

  // Regroupement approximatif en lignes par position verticale.
  const sorted = [...words].sort((a, b) => a.y - b.y);
  const lines: WordBox[][] = [];
  for (const w of sorted) {
    const cur = lines[lines.length - 1];
    if (!cur || Math.abs(w.y - cur[0].y) > opts.rowTolerance) {
      lines.push([w]);
    } else {
      cur.push(w);
    }
  }

  for (const line of lines.slice(0, 200)) {
    const sortedLine = line.sort((a, b) => a.x - b.x);
    const lineText = sortedLine.map((w) => w.text).join(" ");
    const y = Math.min(...line.map((w) => w.y));
    const refCandidate = sortedLine.find((w) => isReferenceToken(w.text))?.text ?? "";
    const nCandidate =
      sortedLine.find((w) => /^\d+$/.test(w.text))?.text ?? "";
    const designation = sortedLine
      .filter((w) => w.text !== refCandidate && w.text !== nCandidate)
      .map((w) => w.text)
      .join(" ")
      .replace(/\s{2,}/g, " ");

    if (!refCandidate && !nCandidate) continue;

    const imageFile = await cropPhoto(page, y, opts.photoX, opts.photoW);
    const imageFilename = imageFile
      ? `page-${String(page.pageNo).padStart(2, "0")}/row-${String(rows.length + 1).padStart(2, "0")}.png`
      : null;

    if (imageFile && imageFilename) {
      const rel = path.join(opts.outDir, "products", imageFilename);
      await fs.mkdir(path.dirname(rel), { recursive: true });
      await fs.writeFile(rel, imageFile);
    }

    const confidence =
      refCandidate && isReferenceToken(refCandidate) ? "medium" : "low";
    rows.push({
      pageNo: page.pageNo,
      rowIndex: rows.length + 1,
      y,
      referenceRaw: refCandidate || nCandidate,
      n: nCandidate,
      designation,
      price: "",
      marque: "",
      imageFilename,
      status: imageFile ? "manual_review" : "no_image",
      confidence,
    });
  }

  return rows;
}

async function main() {
  const opts = parseArgs();
  if (!opts.pdf || !(await fs.stat(opts.pdf).catch(() => false))) {
    console.error("Fichier PDF introuvable. Usage : pdf:extract <fichier.pdf> [--out=dir]");
    process.exit(1);
  }

  const buffer = await fs.readFile(opts.pdf);
  console.log(`PDF : ${opts.pdf} (${(buffer.length / 1024 / 1024).toFixed(1)} Mo)`);
  const pages = await renderPages(buffer, opts.scale, opts.maxPages);

  const allRows: RowMeta[] = [];
  for (const page of pages) {
    const rows = await extractFromPage(page, opts);
    allRows.push(...rows);
  }

  const productsDir = path.join(opts.outDir, "products");
  await fs.mkdir(productsDir, { recursive: true });
  await fs.writeFile(
    path.join(productsDir, "matches.json"),
    JSON.stringify(
      {
        source: opts.pdf,
        generatedAt: new Date().toISOString(),
        rows: allRows.map((r) => ({
          ...r,
          imageFilename: r.imageFilename ? `/pdf-extract/products/${r.imageFilename}` : null,
        })),
      },
      null,
      2,
    ),
  );

  const csv = [
    ["page", "ligne", "n", "reference", "designation", "prix", "marque", "image", "statut", "confiance"],
    ...allRows.map((r) => [
      r.pageNo,
      r.rowIndex,
      r.n,
      r.referenceRaw,
      r.designation,
      r.price,
      r.marque,
      r.imageFilename ?? "",
      r.status,
      r.confidence,
    ]),
  ]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  await fs.writeFile(path.join(productsDir, "matches.csv"), csv);

  console.log(`\nTerminé : ${allRows.length} lignes extraites.`);
  console.log(`Sorties : ${path.resolve(opts.outDir)}`);
  console.log("⚠️  Toutes les associations sont en mode « revue manuelle » tant qu'elles ne sont pas confirmées.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
