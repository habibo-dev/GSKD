import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import { listParts, type PartFilters } from "@/lib/queries";
import { getSettings, type AppSettings } from "@/lib/settings";
import { partObjectKey } from "@/lib/images";
import { storageRead } from "@/lib/storage";
import { toNum } from "@/lib/format";

// ---------------------------------------------------------------------------
// Export PDF serveur réel (pdf-lib) — catalogue & stock.
// Génère un PDF téléchargeable contenant référence, désignation, marque, prix
// de vente, stock (selon export) et l'image canonique du produit (selon export).
// Les images sont les MÊMES images canoniques utilisées par Pièces/Stock/
// Catalogue/Ventes : une pièce → une image → partout la même.
// ---------------------------------------------------------------------------

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 34;
const BOTTOM_PAD = 52;
const HEADER_H = 88;
const COL_PHOTO = 46;
const COL_REF = 90;
const COL_MARQUE = 60;
const COL_PRIX = 76;
const COL_STOCK = 54;
const GAP = 6;
const ROW_MIN = 40;
const LINE_H = 12;
const FONT_SIZE = 8.5;

export type PdfScope = "catalogue" | "stock";
export type PdfOptions = { images: boolean; stock: boolean; stockOnly?: boolean };

type ProductRow = {
  reference: string;
  designation: string;
  brand: string | null;
  retailPrice: string;
  currentStock: string;
  unit: string;
  imageFilename: string | null;
};

type AppCfg = Pick<
  AppSettings,
  "businessName" | "phone" | "address" | "currencySuffix"
>;

async function fetchRows(filters: PartFilters): Promise<ProductRow[]> {
  const { rows } = await listParts(filters, { perPage: 5000, page: 1 });
  return rows as unknown as ProductRow[];
}

// pdf-lib / Helvetica (WinAnsi) ne sait pas encoder certains espaces Unicode
// (ex. espace insécable étroite U+202F utilisée par le formatage fr-FR).
// On les remplace par des espaces normales avant de dessiner le texte.
function san(s: string): string {
  return String(s).replace(/[\u00A0\u202F\u2007\u2009]/g, " ");
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n).replace(/[\u00A0\u202F\u2009]/g, " ");
}

function wrapLines(
  font: PDFFont,
  size: number,
  text: string,
  maxWidth: number,
): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadRaw(
  filename: string,
): Promise<{ buffer: Buffer; kind: "png" | "jpg" | "webp" } | null> {
  try {
    const obj = await storageRead(partObjectKey(filename));
    if (!obj) return null;
    const buf = obj.data;
    const lower = filename.toLowerCase();
    if (lower.endsWith(".png")) return { buffer: buf, kind: "png" };
    if (lower.endsWith(".webp")) return { buffer: buf, kind: "webp" };
    return { buffer: buf, kind: "jpg" };
  } catch {
    return null;
  }
}

async function embedImage(
  doc: PDFDocument,
  filename: string,
  cache: Map<string, PDFImage>,
): Promise<PDFImage | null> {
  if (cache.has(filename)) return cache.get(filename) ?? null;
  const src = await loadRaw(filename);
  let img: PDFImage | null = null;
  if (src) {
    try {
      if (src.kind === "webp") {
        const { createCanvas, loadImage } = await import("@napi-rs/canvas");
        const ci = await loadImage(new Uint8Array(src.buffer));
        const c = createCanvas(ci.width, ci.height);
        const ctx = c.getContext("2d") as any;
        ctx.drawImage(ci, 0, 0);
        img = await doc.embedPng(
          new Uint8Array(Buffer.from(c.toBuffer("image/png"))),
        );
      } else if (src.kind === "png") {
        img = await doc.embedPng(new Uint8Array(src.buffer));
      } else {
        img = await doc.embedJpg(new Uint8Array(src.buffer));
      }
    } catch {
      img = null;
    }
  }
  if (img) cache.set(filename, img);
  return img;
}

async function drawImageBox(
  doc: PDFDocument,
  page: PDFPage,
  p: ProductRow,
  x: number,
  yBottom: number,
  w: number,
  h: number,
  cache: Map<string, PDFImage>,
) {
  const placeholder = () => {
    page.drawRectangle({
      x,
      y: yBottom,
      width: w,
      height: h,
      borderColor: rgb(0.82, 0.84, 0.88),
      borderWidth: 0.6,
      color: rgb(0.965, 0.968, 0.972),
    });
  };
  if (!p.imageFilename) {
    placeholder();
    return;
  }
  const img = await embedImage(doc, p.imageFilename, cache);
  if (!img) {
    placeholder();
    return;
  }
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  page.drawImage(img, {
    x: x + (w - dw) / 2,
    y: yBottom + (h - dh) / 2,
    width: dw,
    height: dh,
  });
}

export async function buildPdfExport(
  scope: PdfScope,
  filters: PartFilters,
  opts: PdfOptions,
): Promise<{ buffer: Uint8Array; filename: string }> {
  const cfg = (await getSettings()) as AppCfg;
  let rows = await fetchRows(filters);
  if (opts.stockOnly) rows = rows.filter((r) => toNum(r.currentStock) > 0);
  const includeImages = opts.images;
  const includeStock = opts.stock;
  const currency = cfg.currencySuffix || "DA";

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const imgCache: Map<string, PDFImage> = new Map();

  // Bornes horizontales des colonnes.
  let xRef = MARGIN;
  if (includeImages) xRef += COL_PHOTO + GAP;
  const xPhoto = MARGIN;
  const xDes = xRef + COL_REF + GAP;
  const xMarque = xDes + 130; // zone désignation flexible ~130pt
  const desWidth = xMarque - xDes;
  const xPrix = xMarque + COL_MARQUE + GAP;
  const xStock = xPrix + COL_PRIX + GAP;
  const headerTextColor = rgb(0.15, 0.17, 0.22);

  let page: PDFPage | null = null;
  let yTop = 0;

  const startPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    yTop = PAGE_H - HEADER_H;
    page.drawText(san(cfg.businessName || "Autostock"), {
      x: MARGIN,
      y: PAGE_H - 30,
      size: 17,
      font: fontBold,
      color: rgb(0.08, 0.1, 0.15),
    });
    const sub =
      scope === "stock"
        ? "État du stock au prix de vente"
        : "Liste des articles au prix de vente";
    page.drawText(sub, {
      x: MARGIN,
      y: PAGE_H - 44,
      size: 10,
      font,
      color: rgb(0.3, 0.32, 0.38),
    });
    const dateStr = san(`Édition du ${new Date().toLocaleDateString("fr-FR")}`);
    page.drawText(dateStr, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(dateStr, 9),
      y: PAGE_H - 40,
      size: 9,
      font,
      color: rgb(0.4, 0.42, 0.46),
    });
    const hb = PAGE_H - 62;
    page.drawLine({
      start: { x: MARGIN, y: hb + 10 },
      end: { x: PAGE_W - MARGIN, y: hb + 10 },
      thickness: 1,
      color: rgb(0.6, 0.62, 0.66),
    });
    let cx = xPhoto;
    if (includeImages) {
      page.drawText("Photo", { x: cx, y: hb, size: FONT_SIZE, font: fontBold, color: headerTextColor });
    }
    page.drawText("Référence", { x: xRef, y: hb, size: FONT_SIZE, font: fontBold, color: headerTextColor });
    page.drawText("Désignation", { x: xDes, y: hb, size: FONT_SIZE, font: fontBold, color: headerTextColor });
    page.drawText("Marque", { x: xMarque, y: hb, size: FONT_SIZE, font: fontBold, color: headerTextColor });
    page.drawText("Prix vente", { x: xPrix, y: hb, size: FONT_SIZE, font: fontBold, color: headerTextColor });
    if (includeStock)
      page.drawText("Stock", { x: xStock, y: hb, size: FONT_SIZE, font: fontBold, color: headerTextColor });
    page.drawLine({
      start: { x: MARGIN, y: hb - 4 },
      end: { x: PAGE_W - MARGIN, y: hb - 4 },
      thickness: 1,
      color: rgb(0.6, 0.62, 0.66),
    });
    void cx;
  };

  const rowHeightOf = (p: ProductRow) => {
    const lines = Math.max(1, wrapLines(font, FONT_SIZE, p.designation, desWidth).length);
    return Math.max(ROW_MIN, lines * LINE_H + 10);
  };

  const drawRow = async (p: ProductRow) => {
    const rowH = rowHeightOf(p);
    if (!page || yTop - rowH < BOTTOM_PAD) startPage();
    const pg = page!;
    const topY = yTop;
    pg.drawLine({
      start: { x: MARGIN, y: topY - rowH },
      end: { x: PAGE_W - MARGIN, y: topY - rowH },
      thickness: 0.4,
      color: rgb(0.9, 0.91, 0.93),
    });
    if (includeImages) {
      await drawImageBox(doc, pg, p, xPhoto, topY - rowH + 3, COL_PHOTO, rowH - 6, imgCache);
    }
    pg.drawText(san(p.reference), { x: xRef, y: topY - 16, size: FONT_SIZE, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
    const desLines = wrapLines(font, FONT_SIZE, p.designation, desWidth);
    desLines.forEach((ln, i) => {
      pg.drawText(san(ln), { x: xDes, y: topY - 16 - i * LINE_H, size: FONT_SIZE, font, color: rgb(0.16, 0.18, 0.24) });
    });
    pg.drawText(san(String(p.brand || "—")), { x: xMarque, y: topY - 16, size: FONT_SIZE, font, color: rgb(0.3, 0.32, 0.36) });
    const prixTxt = `${fmtNum(toNum(p.retailPrice))} ${san(currency)}`;
    pg.drawText(prixTxt, { x: xPrix, y: topY - 16, size: FONT_SIZE, font: fontBold, color: rgb(0.05, 0.2, 0.55) });
    if (includeStock) {
      pg.drawText(`${toNum(p.currentStock)} ${san(p.unit)}`, {
        x: xStock,
        y: topY - 16,
        size: FONT_SIZE,
        font,
        color: rgb(0.2, 0.22, 0.26),
      });
    }
    yTop = topY - rowH;
  };

  startPage();
  for (const p of rows) {
    await drawRow(p);
  }
  if (rows.length === 0) {
    page!.drawText("Aucune donnée à exporter.", {
      x: MARGIN,
      y: yTop - 40,
      size: 11,
      font,
      color: rgb(0.4, 0.42, 0.46),
    });
  }

  const bytes = await doc.save();
  const stamp = new Date().toISOString().slice(0, 10);
  return { buffer: bytes, filename: `${scope}-${stamp}.pdf` };
}
