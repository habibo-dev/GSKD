// ---------------------------------------------------------------------------
// Chargement des fichiers réels du client depuis `data/`.
//
//   data/*.csv | *.xlsx | *.xls
//
// L'import utilise exactement le même pipeline que l'application
// (analyse du classeur, mapping automatique, détection de doublons et
// mise à jour avec traçabilité des stocks). Aucune donnée n'est inventée.
//
// Usage :
//   DATABASE_URL=... npm run data:load
// ---------------------------------------------------------------------------

import { promises as fs } from "fs";
import path from "path";
import { analyzeWorkbook } from "@/lib/excel";
import { executeImport } from "@/lib/imports";

const DATA_DIR = path.join(process.cwd(), "data");
const EXTENSIONS = [".csv", ".xlsx", ".xls", ".xlsm", ".xlsb"];

async function main() {
  let entries: string[];
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch {
    console.error(`Le dossier ${DATA_DIR} est introuvable.`);
    process.exit(1);
  }

  const files = entries
    .filter((f) => EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();
  if (!files.length) {
    console.log(
      `Aucun fichier client dans ${DATA_DIR}. Placez-y les CSV/Excel réels puis relancez \`npm run data:load\`.`,
    );
    process.exit(0);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  let duplicates = 0;

  for (const file of files) {
    const full = path.join(DATA_DIR, file);
    const buffer = await fs.readFile(full);
    console.log(`\n=== ${file} ===`);
    const sheets = analyzeWorkbook(buffer, file);
    if (!sheets.length) {
      console.warn("  Aucune feuille exploitable.");
      continue;
    }
    const sheet = sheets[0];
    const mapping = sheet.autoMapping;
    if (!mapping.reference) {
      console.warn(`  Colonne Référence non détectée dans « ${sheet.name} ».`);
      continue;
    }
    const result = await executeImport(
      buffer,
      file,
      sheet.name,
      sheet.headerRow,
      mapping,
      "update",
    );
    created += result.created;
    updated += result.updated;
    skipped += result.skipped;
    invalid += result.invalid;
    duplicates += result.duplicates;
    console.log(
      `  ${sheet.name} — ${result.total} lignes : ${result.created} créées, ${result.updated} mises à jour, ${result.skipped} ignorées, ${result.duplicates} doublons, ${result.invalid} invalides.`,
    );
  }

  console.log(
    `\nRésultat global : ${created} créées, ${updated} mises à jour, ${skipped} ignorées, ${duplicates} doublons, ${invalid} invalides.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
