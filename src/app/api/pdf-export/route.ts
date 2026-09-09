import { NextRequest, NextResponse } from "next/server";
import { buildPdfExport, type PdfScope } from "@/lib/pdf-export";
import type { PartFilters } from "@/lib/queries";
import type { StockStatus } from "@/lib/format";

export const dynamic = "force-dynamic";

const SCOPES: PdfScope[] = ["catalogue", "stock"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const scope = (sp.get("scope") ?? "catalogue") as PdfScope;
  if (!SCOPES.includes(scope)) {
    return NextResponse.json({ error: "Export inconnu." }, { status: 400 });
  }
  const images = sp.get("images") !== "0" && sp.get("images") !== "false";
  const stock = sp.get("stock") === "1" || sp.get("stock") === "true";
  const stockOnly = sp.get("stockonly") === "1";

  const filters: PartFilters = {
    q: sp.get("q") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    category: sp.get("category") ?? undefined,
    rayon: sp.get("rayon") ?? undefined,
    status: (sp.get("status") as StockStatus) || undefined,
  };

  try {
    const { buffer, filename } = await buildPdfExport(scope, filters, {
      images,
      stock,
      stockOnly,
    });
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Échec de la génération du PDF.",
      },
      { status: 500 },
    );
  }
}
