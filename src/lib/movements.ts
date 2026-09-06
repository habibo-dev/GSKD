import { db } from "@/db";
import {
  parts,
  stockMovements,
  sales,
  saleItems,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { toNum } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export type MovementType =
  | "entree"
  | "vente"
  | "retour"
  | "ajustement_pos"
  | "ajustement_neg";

const DIRECTION: Record<MovementType, 1 | -1> = {
  entree: 1,
  retour: 1,
  ajustement_pos: 1,
  vente: -1,
  ajustement_neg: -1,
};

export class StockError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Applique un mouvement de stock de façon transactionnelle :
 * verrouille la pièce, vérifie le stock, crée le mouvement (audit),
 * met à jour le stock courant et les quantités vendues.
 */
export async function applyStockChange(
  tx: Tx,
  input: {
    partId: number;
    type: MovementType;
    quantity: number;
    userName?: string | null;
    reason?: string | null;
    documentRef?: string | null;
    saleId?: number | null;
    allowNegative?: boolean;
  },
) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new StockError(
      "INVALID_QUANTITY",
      "La quantité doit être un nombre positif.",
    );
  }

  const locked = await tx.execute(
    sql`SELECT id, reference, current_stock, sold_quantity FROM parts WHERE id = ${input.partId} FOR UPDATE`,
  );
  const row = locked.rows[0] as
    | {
        id: number;
        reference: string;
        current_stock: string;
        sold_quantity: string;
      }
    | undefined;
  if (!row) {
    throw new StockError("NOT_FOUND", "Pièce introuvable.");
  }

  const previous = toNum(row.current_stock);
  const direction = DIRECTION[input.type];
  const next = previous + direction * input.quantity;

  if (next < 0 && !input.allowNegative) {
    throw new StockError(
      "INSUFFICIENT_STOCK",
      `Stock insuffisant pour « ${row.reference} » : ${previous} disponible(s).`,
    );
  }

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      partId: input.partId,
      partReference: row.reference,
      type: input.type,
      quantity: String(input.quantity),
      previousStock: String(previous),
      newStock: String(next),
      userName: input.userName ?? null,
      reason: input.reason ?? null,
      documentRef: input.documentRef ?? null,
      saleId: input.saleId ?? null,
    })
    .returning();

  await tx
    .update(parts)
    .set({
      currentStock: String(next),
      soldQuantity:
        input.type === "vente"
          ? String(toNum(row.sold_quantity) + input.quantity)
          : row.sold_quantity,
      updatedAt: new Date(),
    })
    .where(eq(parts.id, input.partId));

  return { movement, previousStock: previous, newStock: next };
}

/** Recalcule stock courant et quantité vendue depuis l'historique (maintenance). */
export async function recomputePartStock(tx: Tx, partId: number) {
  const [part] = await tx.select().from(parts).where(eq(parts.id, partId));
  if (!part) return;
  const agg = await tx.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN type IN ('entree','retour','ajustement_pos') THEN quantity ELSE 0 END), 0) AS ins,
      COALESCE(SUM(CASE WHEN type IN ('vente','ajustement_neg') THEN quantity ELSE 0 END), 0) AS outs,
      COALESCE(SUM(CASE WHEN type = 'vente' THEN quantity ELSE 0 END), 0) AS sold
    FROM stock_movements WHERE part_id = ${partId}
  `);
  const a = agg.rows[0] as { ins: string; outs: string; sold: string };
  const current = toNum(part.initialStock) + toNum(a.ins) - toNum(a.outs);
  await tx
    .update(parts)
    .set({
      currentStock: String(current),
      soldQuantity: a.sold,
      updatedAt: new Date(),
    })
    .where(eq(parts.id, partId));
  return { currentStock: current, soldQuantity: toNum(a.sold) };
}

export type SaleLineInput = {
  partId: number;
  quantity: number;
  priceType: "gros" | "detail";
};

export async function createSale(input: {
  clientName?: string | null;
  userName?: string | null;
  notes?: string | null;
  items: SaleLineInput[];
}) {
  const cfg = await getSettings();
  if (!input.items.length) {
    throw new StockError("EMPTY_SALE", "La vente ne contient aucune ligne.");
  }

  return db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(sales)
      .values({
        clientName: input.clientName || null,
        userName: input.userName || cfg.defaultUser,
        notes: input.notes || null,
      })
      .returning();

    let total = 0;
    let count = 0;

    for (const item of input.items) {
      const [part] = await tx.select().from(parts).where(eq(parts.id, item.partId));
      if (!part) throw new StockError("NOT_FOUND", "Pièce introuvable.");

      const result = await applyStockChange(tx, {
        partId: item.partId,
        type: "vente",
        quantity: item.quantity,
        userName: input.userName || cfg.defaultUser,
        reason: "Vente",
        saleId: sale.id,
        allowNegative: cfg.allowNegativeStock,
      });

      const unitPrice =
        item.priceType === "gros"
          ? toNum(part.wholesalePrice)
          : toNum(part.retailPrice);
      const lineTotal = unitPrice * item.quantity;
      total += lineTotal;
      count += 1;

      await tx.insert(saleItems).values({
        saleId: sale.id,
        partId: item.partId,
        partReference: part.reference,
        designation: part.designation,
        quantity: String(item.quantity),
        unitPrice: String(unitPrice),
        priceType: item.priceType,
        lineTotal: String(lineTotal),
      });
      void result;
    }

    const number = `V-${String(sale.id).padStart(5, "0")}`;
    await tx
      .update(sales)
      .set({ number, totalAmount: String(total), itemCount: count })
      .where(eq(sales.id, sale.id));

    return { saleId: sale.id, number, total };
  });
}
