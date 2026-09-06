import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { applyStockChange, StockError, type MovementType } from "@/lib/movements";
import { listMovements } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { getAuthUser, isAuthEnabled, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED: MovementType[] = ["entree", "retour", "sortie", "ajustement_pos", "ajustement_neg"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rows = await listMovements({
    type: sp.get("type") ?? undefined,
    q: sp.get("q") ?? undefined,
    limit: Number(sp.get("limit")) || 120,
  });
  return NextResponse.json({ movements: rows });
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const partId = Number(body.partId);
  const type = String(body.type ?? "") as MovementType;
  const quantity = Number(String(body.quantity ?? "").replace(",", "."));

  if (!Number.isInteger(partId)) {
    return NextResponse.json({ error: "Pièce invalide." }, { status: 400 });
  }
  if (!ALLOWED.includes(type)) {
    return NextResponse.json(
      { error: "Type de mouvement invalide (les ventes passent par le module Ventes)." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Quantité invalide." }, { status: 400 });
  }

  const [cfg, authEnabled, user] = await Promise.all([
    getSettings(),
    isAuthEnabled(),
    getAuthUser(),
  ]);
  const userName = authEnabled
    ? user?.name ?? cfg.defaultUser
    : String(body.userName ?? "").trim() || cfg.defaultUser;

  try {
    const result = await db.transaction(async (tx) =>
      applyStockChange(tx, {
        partId,
        type,
        quantity: Math.round(quantity * 1000) / 1000,
        userName: userName,
        reason: String(body.reason ?? "").trim() || null,
        documentRef: String(body.documentRef ?? "").trim() || null,
        allowNegative: cfg.allowNegativeStock,
      }),
    );
    return NextResponse.json(
      { ok: true, previousStock: result.previousStock, newStock: result.newStock },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof StockError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
