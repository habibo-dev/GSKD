import * as XLSX from "xlsx";
import { norm } from "@/lib/normalize";

// ---------------------------------------------------------------------------
// Import Excel : détection du classeur, des feuilles, des colonnes et mapping
// ---------------------------------------------------------------------------

export type TargetField =
  | "reference"
  | "designation"
  | "marque"
  | "quantite"
  | "prixAchat"
  | "prixGros"
  | "prixDetail"
  | "um"
  | "rayon"
  | "categorie";

export const TARGET_FIELDS: Array<{ key: TargetField; label: string }> = [
  { key: "reference", label: "Référence" },
  { key: "designation", label: "Désignation" },
  { key: "marque", label: "Marque" },
  { key: "quantite", label: "Quantité" },
  { key: "prixAchat", label: "Prix d'Achat" },
  { key: "prixGros", label: "Prix Gros" },
  { key: "prixDetail", label: "Prix Détail" },
  { key: "um", label: "UM" },
  { key: "rayon", label: "Rayon" },
  { key: "categorie", label: "Catégorie (optionnel)" },
];

const ALIASES: Record<TargetField, string[]> = {
  reference: [
    "reference",
    "references",
    "ref",
    "code",
    "code article",
    "oem",
    "numero",
    "numero piece",
    "ref piece",
  ],
  designation: [
    "designation",
    "libelle",
    "description",
    "article",
    "nom",
    "produit",
    "piece",
  ],
  marque: ["marque", "brand", "fabricant", "marque piece"],
  quantite: [
    "quantite",
    "qte",
    "stock",
    "stock initial",
    "quantite stock",
    "qty",
    "en stock",
  ],
  prixAchat: [
    "prix d'achat",
    "prix achat",
    "pa",
    "achat",
    "prix d achat",
    "purchase price",
    "cout",
    "cout d'achat",
    "prix coutant",
  ],
  prixGros: [
    "prix gros",
    "prix de gros",
    "gros",
    "pg",
    "wholesale",
    "prix vente gros",
    "prix de vente gros",
  ],
  prixDetail: [
    "prix detail",
    "detail",
    "pd",
    "prix vente",
    "prix de vente",
    "retail",
    "pv",
    "prix de vente detail",
    "vente",
  ],
  um: ["um", "unite", "unit", "unite de mesure"],
  rayon: ["rayon", "emplacement", "location", "casier", "zone", "etagere"],
  categorie: ["categorie", "famille", "category", "type", "gamme"],
};

export type SheetInfo = {
  name: string;
  rowCount: number;
  headerRow: number; // index 0-based dans la grille
  columns: string[];
  sample: string[][]; // 4 premières lignes (dont l'en-tête)
  autoMapping: Partial<Record<TargetField, string>>;
  ignoredColumns: string[];
};

function gridRows(ws: XLSX.WorkSheet): string[][] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });
  return aoa.map((r) =>
    r.map((c) => (c === null || c === undefined ? "" : String(c).trim())),
  );
}

/** Score d'une ligne comme ligne d'en-tête, selon les alias connus. */
function headerScore(cells: string[]): number {
  let score = 0;
  for (const cell of cells) {
    const n = norm(cell);
    if (!n) continue;
    for (const aliases of Object.values(ALIASES)) {
      if (aliases.includes(n)) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

function autoMap(columns: string[]): {
  mapping: Partial<Record<TargetField, string>>;
  ignored: string[];
} {
  const mapping: Partial<Record<TargetField, string>> = {};
  const usedBy = new Map<string, TargetField>();
  for (const col of columns) {
    const n = norm(col);
    if (!n) continue;
    for (const [field, aliases] of Object.entries(ALIASES) as Array<
      [TargetField, string[]]
    >) {
      if (aliases.includes(n) && !mapping[field]) {
        mapping[field] = col;
        usedBy.set(col, field);
        break;
      }
    }
  }
  const ignored = columns.filter(
    (c) => norm(c) !== "" && !usedBy.has(c),
  );
  return { mapping, ignored };
}

/** Analyse un classeur : feuilles, colonnes détectées, mapping automatique. */
export function analyzeWorkbook(buffer: Buffer): SheetInfo[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const infos: SheetInfo[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = gridRows(ws);
    if (rows.length === 0) {
      infos.push({
        name,
        rowCount: 0,
        headerRow: 0,
        columns: [],
        sample: [],
        autoMapping: {},
        ignoredColumns: [],
      });
      continue;
    }
    let headerRow = 0;
    let best = 0;
    const limit = Math.min(8, rows.length);
    for (let i = 0; i < limit; i++) {
      const s = headerScore(rows[i]);
      if (s > best) {
        best = s;
        headerRow = i;
      }
    }
    const columns = rows[headerRow].map((c, i) =>
      c === "" ? `Colonne ${i + 1}` : c,
    );
    const { mapping, ignored } = autoMap(rows[headerRow]);
    infos.push({
      name,
      rowCount: rows.length - headerRow - 1,
      headerRow,
      columns,
      sample: rows.slice(headerRow, headerRow + 5),
      autoMapping: mapping,
      ignoredColumns: ignored,
    });
  }
  return infos;
}

export type ExtractedRow = {
  rowNumber: number; // numéro de ligne Excel (1-based, dans le fichier)
  reference: string;
  designation: string;
  marque: string;
  quantite: string;
  prixAchat: string;
  prixGros: string;
  prixDetail: string;
  um: string;
  rayon: string;
  categorie: string;
  extra: Record<string, string>;
};

/** Extrait les lignes selon le mapping choisi par l'utilisateur. */
export function extractRows(
  buffer: Buffer,
  sheetName: string,
  headerRow: number,
  mapping: Partial<Record<TargetField, string>>,
): ExtractedRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("Feuille introuvable dans le classeur.");
  const rows = gridRows(ws);
  const headers = rows[headerRow] ?? [];
  const colIndex = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!colIndex.has(h)) colIndex.set(h, i);
  });

  const mapped = new Set<string>(Object.values(mapping).filter(Boolean) as string[]);
  const out: ExtractedRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const cells = rows[i];
    const value = (field: TargetField) => {
      const col = mapping[field];
      if (!col) return "";
      const idx = colIndex.get(col);
      return idx === undefined ? "" : (cells[idx] ?? "");
    };
    const extra: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h && !mapped.has(h) && cells[idx]) extra[h] = cells[idx];
    });
    out.push({
      rowNumber: i + 1,
      reference: value("reference"),
      designation: value("designation"),
      marque: value("marque"),
      quantite: value("quantite"),
      prixAchat: value("prixAchat"),
      prixGros: value("prixGros"),
      prixDetail: value("prixDetail"),
      um: value("um"),
      rayon: value("rayon"),
      categorie: value("categorie"),
      extra,
    });
  }
  // Ignore les lignes totalement vides
  return out.filter(
    (r) =>
      r.reference !== "" ||
      r.designation !== "" ||
      (r.quantite !== "" && r.quantite !== "0"),
  );
}

// ---------------------------------------------------------------------------
// Analyse de nombres au format français ("1 250,50", "1250.5", "1 200 DA")
// ---------------------------------------------------------------------------
export function parseFrenchNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (s === "" || s === "-" || s === "—") return null;
  s = s.replace(/[  ]/g, "").replace(/da|dzd|eur|€|\$/gi, "").trim();
  s = s.replace(/[^\d,.\-]/g, "");
  if (s === "" || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Les deux présents : le dernier est le séparateur décimal
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && s.indexOf(",") === lastComma && s.length > 4
      ? s.replace(",", "") // probablement un séparateur de milliers
      : s.replace(",", ".");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && s.indexOf(".") === lastDot && s.length > 4) {
      s = s.replace(".", "");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Arrondi sûr à 3 décimales pour les quantités. */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}
