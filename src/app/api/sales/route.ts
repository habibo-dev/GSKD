import { NextRequest, NextResponse } from "next/server";
import { createSale, StockError, type SaleLineInput } from "@/lib/movements";
import { listSales } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listSales(60);
  return NextResponse.json({ sales: rows });
}

export async function POST(req: NextRequest) {
  let body: {
    clientName?: string;
    userName?: string;
    notes?: string;
    items?: SaleLineInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const items = (body.items ?? [])
    .map((it) => ({
      partId: Number(it.partId),
      quantity: Number(String(it.quantity).replace(",", ".")),
      priceType: it.priceType === "gros" ? ("gros" as const) : ("detail" as const),
    }))
    .filter((it) => Number.isInteger(it.partId) && it.quantity > 0);

  if (!items.length) {
    return NextResponse.json(
      { error: "Ajoutez au moins une ligne valide à la vente." },
      { status: 400 },
    );
  }

  try {
    const result = await createSale({
      clientName: body.clientName?.trim() || null,
      userName: body.userName?.trim() || null,
      notes: body.notes?.trim() || null,
      items,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof StockError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
