import { NextRequest, NextResponse } from "next/server";
import { buildExport, type ExportType } from "@/lib/export";
import type { PartFilters } from "@/lib/queries";
import type { StockStatus } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPES: ExportType[] = [
  "stock",
  "catalogue",
  "stock-faible",
  "ruptures",
  "ventes",
  "mouvements",
];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") ?? "stock") as ExportType;
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "Type d'export inconnu." }, { status: 400 });
  }
  const filters: PartFilters & { from?: string; to?: string } = {
    q: sp.get("q") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    category: sp.get("category") ?? undefined,
    rayon: sp.get("rayon") ?? undefined,
    status: (sp.get("status") as StockStatus) || undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  };
  const { buffer, filename } = await buildExport(type, filters);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
