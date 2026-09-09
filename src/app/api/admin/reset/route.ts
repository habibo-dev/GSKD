import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { storageDeletePrefix } from "@/lib/storage";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Purge complète des données (démonstration / remise à zéro avant production). */
export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (body.confirm !== "PURGER") {
    return NextResponse.json(
      { error: "Confirmation requise : saisissez PURGER." },
      { status: 400 },
    );
  }
  const tables = [
    "sale_items",
    "sales",
    "stock_movements",
    "compatibilities",
    "images",
    "part_references",
    "parts",
    "vehicles",
    "import_batches",
    "brands",
    "categories",
    "suppliers",
  ];
  for (const t of tables) {
    await db.execute(sql.raw(`DELETE FROM ${t}`));
  }
  // Purge les objets images / artefacts d'import du stockage (Blob en prod).
  await storageDeletePrefix("parts");
  await storageDeletePrefix("pdf-import");
  return NextResponse.json({ ok: true });
}
