/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// Données de DÉMONSTRATION — inventaire de pièces automobiles.
// Ce jeu de données est clairement séparé (lot d'import « demo ») et peut être
// purgé depuis Paramètres → Zone dangereuse avant la mise en production.
// Idempotent : ne s'exécute que si la table `parts` est vide.
// ---------------------------------------------------------------------------
import "dotenv/config";
import { db } from "./index";
import {
  users,
  brands,
  categories,
  parts,
  partReferences,
  images,
  sales,
  saleItems,
  stockMovements,
  vehicles,
  importBatches,
} from "./schema";
import { sql } from "drizzle-orm";
import { splitReferences } from "../lib/normalize";

type DemoPart = {
  ref: string; // cellule brute (peut contenir " / ")
  designation: string;
  marque: string;
  categorie: string;
  rayon: string;
  um?: string;
  pa: number;
  pg: number;
  pd: number;
  initial: number;
  min?: number;
  image?: string;
};

const DEMO: DemoPart[] = [
  { ref: "7703800107 / 8200651172", designation: "Filtre à huile", marque: "Purflux", categorie: "Filtration", rayon: "A2", pa: 800, pg: 1100, pd: 1400, initial: 24, image: "demo-oil-filter.jpg" },
  { ref: "7701207132", designation: "Plaquettes de frein avant", marque: "Bosch", categorie: "Freinage", rayon: "A1", um: "Jeu", pa: 1900, pg: 2600, pd: 3200, initial: 10, image: "demo-brake-pads.jpg" },
  { ref: "7701477017", designation: "Kit d'embrayage complet", marque: "Valeo", categorie: "Embrayage", rayon: "B1", um: "Kit", pa: 9800, pg: 12000, pd: 14500, initial: 5, image: "demo-clutch-kit.jpg" },
  { ref: "8200497032", designation: "Amortisseur avant gauche", marque: "Monroe", categorie: "Suspension", rayon: "C3", pa: 5200, pg: 6400, pd: 7500, initial: 6, image: "demo-shock-absorber.jpg" },
  { ref: "7701049708", designation: "Projecteur avant droit", marque: "Valeo", categorie: "Éclairage", rayon: "D1", pa: 9200, pg: 11500, pd: 13800, initial: 3, image: "demo-headlight.jpg" },
  { ref: "224018760R", designation: "Bougies d'allumage (jeu de 4)", marque: "NGK", categorie: "Allumage", rayon: "A3", um: "Jeu", pa: 1150, pg: 1450, pd: 1800, initial: 16, image: "demo-spark-plugs.jpg" },
  { ref: "8200371661", designation: "Filtre à air moteur", marque: "Mann-Filter", categorie: "Filtration", rayon: "A2", pa: 1400, pg: 1800, pd: 2300, initial: 8, image: "demo-air-filter.jpg" },
  { ref: "8200048642 / 7701205754", designation: "Disque de frein avant", marque: "Brembo", categorie: "Freinage", rayon: "A1", pa: 3400, pg: 4300, pd: 5200, initial: 12 },
  { ref: "7700425819", designation: "Filtre à carburant", marque: "Purflux", categorie: "Filtration", rayon: "A2", pa: 950, pg: 1250, pd: 1600, initial: 9 },
  { ref: "8200025640", designation: "Courroie de distribution", marque: "Gates", categorie: "Distribution", rayon: "B2", pa: 2600, pg: 3300, pd: 4100, initial: 14 },
  { ref: "7701476579 / 8200543446", designation: "Kit distribution + pompe à eau", marque: "Gates", categorie: "Distribution", rayon: "B2", um: "Kit", pa: 13500, pg: 16800, pd: 19800, initial: 6 },
  { ref: "8200101172", designation: "Pompe à eau", marque: "SKF", categorie: "Refroidissement", rayon: "B3", pa: 3800, pg: 4700, pd: 5800, initial: 4 },
  { ref: "7701062317", designation: "Rotule de direction", marque: "Febi Bilstein", categorie: "Direction", rayon: "C1", pa: 1600, pg: 2100, pd: 2650, initial: 10 },
  { ref: "7701465437", designation: "Rotule de suspension inférieure", marque: "Febi Bilstein", categorie: "Train roulant", rayon: "C1", pa: 1450, pg: 1900, pd: 2400, initial: 7 },
  { ref: "8200208337", designation: "Cardan de transmission gauche", marque: "SKF", categorie: "Train roulant", rayon: "C2", pa: 9800, pg: 12300, pd: 14800, initial: 3 },
  { ref: "7701207704", designation: "Silentbloc de bras de suspension", marque: "Febi Bilstein", categorie: "Suspension", rayon: "C3", pa: 700, pg: 950, pd: 1250, initial: 5 },
  { ref: "6001543358", designation: "Roulement de roue avant", marque: "SKF", categorie: "Train roulant", rayon: "C2", pa: 2900, pg: 3700, pd: 4500, initial: 8 },
  { ref: "8200033621 / 7701034705", designation: "Rétroviseur extérieur gauche", marque: "Valeo", categorie: "Carrosserie", rayon: "D2", pa: 4600, pg: 5900, pd: 7200, initial: 5 },
  { ref: "7700840099", designation: "Plafonnier intérieur", marque: "Renault Origine", categorie: "Éclairage", rayon: "D1", pa: 1200, pg: 1600, pd: 2100, initial: 0 },
  { ref: "8200673764", designation: "Alternateur 90A", marque: "Bosch", categorie: "Électrique", rayon: "E1", pa: 18500, pg: 22800, pd: 26500, initial: 3 },
  { ref: "8200628430", designation: "Démarreur", marque: "Bosch", categorie: "Électrique", rayon: "E1", pa: 16200, pg: 19900, pd: 23400, initial: 2 },
  { ref: "7701499867", designation: "Batterie 12V 60Ah", marque: "Varta", categorie: "Électrique", rayon: "E2", pa: 12800, pg: 15600, pd: 18200, initial: 6 },
  { ref: "8200688889", designation: "Radiateur de refroidissement", marque: "Valeo", categorie: "Refroidissement", rayon: "E3", pa: 11500, pg: 14200, pd: 16900, initial: 4 },
  { ref: "7700861686", designation: "Sonde de température", marque: "Febi Bilstein", categorie: "Moteur", rayon: "M1", pa: 900, pg: 1250, pd: 1650, initial: 11 },
  { ref: "8200006886", designation: "Capteur PMH (vilbrequin)", marque: "Bosch", categorie: "Moteur", rayon: "M1", pa: 2100, pg: 2800, pd: 3500, initial: 7 },
  { ref: "7701471220", designation: "Électrovanne EGR", marque: "Pierburg", categorie: "Moteur", rayon: "M2", pa: 9800, pg: 12500, pd: 15200, initial: 3 },
  { ref: "8200214900", designation: "Injecteur diesel", marque: "Bosch", categorie: "Moteur", rayon: "M2", pa: 46000, pg: 56000, pd: 65000, initial: 0 },
  { ref: "8200037056", designation: "Turbocompresseur", marque: "Garrett", categorie: "Moteur", rayon: "M3", pa: 89000, pg: 108000, pd: 126000, initial: 0 },
  { ref: "7701473673 / 8200268938", designation: "Poulie de vilebrequin", marque: "Gates", categorie: "Moteur", rayon: "M3", pa: 3200, pg: 4100, pd: 5100, initial: 5 },
  { ref: "8200592642", designation: "Support moteur supérieur", marque: "Febi Bilstein", categorie: "Moteur", rayon: "M1", pa: 2400, pg: 3100, pd: 3900, initial: 2, min: 3 },
  { ref: "7701206503", designation: "Silencieux d'échappement arrière", marque: "Walker", categorie: "Échappement", rayon: "F1", pa: 8900, pg: 11200, pd: 13400, initial: 4 },
  { ref: "8200039456", designation: "Catalyseur", marque: "Walker", categorie: "Échappement", rayon: "F1", pa: 34000, pg: 41500, pd: 48000, initial: 2 },
  { ref: "6455-EK", designation: "Biellette de barre stabilisatrice", marque: "Febi Bilstein", categorie: "Suspension", rayon: "C3", pa: 1150, pg: 1550, pd: 1950, initial: 3, min: 3 },
  { ref: "1612470480", designation: "Filtre d'habitacle", marque: "Mann-Filter", categorie: "Filtration", rayon: "A2", pa: 1100, pg: 1450, pd: 1900, initial: 12 },
  { ref: "7701043620", designation: "Émetteur d'embrayage", marque: "Valeo", categorie: "Embrayage", rayon: "B1", pa: 4200, pg: 5300, pd: 6500, initial: 2, min: 2 },
];

const H = 60 * 60 * 1000;
const D = 24 * H;

async function main() {
  const count = await db.execute(sql`SELECT count(*)::int AS n FROM parts`);
  if ((count.rows[0] as { n: number }).n > 0) {
    console.log("La base contient déjà des pièces — seed ignoré.");
    return;
  }

  console.log("Insertion des données de démonstration…");

  await db.insert(users).values({ name: "Administrateur", role: "admin" });

  // Marques & catégories
  const brandIds = new Map<string, number>();
  const catIds = new Map<string, number>();
  for (const p of DEMO) {
    if (!brandIds.has(p.marque)) {
      const [b] = await db.insert(brands).values({ name: p.marque }).onConflictDoNothing().returning();
      if (b) brandIds.set(p.marque, b.id);
      else {
        const [f] = await db.select().from(brands);
        brandIds.set(p.marque, f.id);
      }
    }
    if (!catIds.has(p.categorie)) {
      const [c] = await db.insert(categories).values({ name: p.categorie }).onConflictDoNothing().returning();
      if (c) catIds.set(p.categorie, c.id);
      else {
        const [f] = await db.select().from(categories).where(sql`name = ${p.categorie}`);
        if (f) catIds.set(p.categorie, f.id);
      }
    }
  }

  // Pièces
  const partIds = new Map<string, number>();
  const stock = new Map<string, number>();
  for (const p of DEMO) {
    const tokens = splitReferences(p.ref);
    const primary = tokens[0];
    const [row] = await db
      .insert(parts)
      .values({
        reference: primary,
        referenceRaw: p.ref,
        designation: p.designation,
        brandId: brandIds.get(p.marque) ?? null,
        categoryId: catIds.get(p.categorie) ?? null,
        purchasePrice: String(p.pa),
        wholesalePrice: String(p.pg),
        retailPrice: String(p.pd),
        initialStock: String(p.initial),
        currentStock: String(p.initial),
        minStock: String(p.min ?? 2),
        unit: p.um ?? "U",
        location: p.rayon,
      })
      .returning();
    partIds.set(primary, row.id);
    stock.set(primary, p.initial);
    await db.insert(partReferences).values(
      tokens.map((t, i) => ({ partId: row.id, reference: t, isPrimary: i === 0 })),
    );
    if (p.image) {
      await db.insert(images).values({ partId: row.id, filename: p.image, originalName: p.image, mime: "image/jpeg" });
    }
  }

  const get = (primaryRefToken: string) => {
    for (const p of DEMO) {
      if (p.ref.includes(primaryRefToken)) {
        const tokens = splitReferences(p.ref);
        return { id: partIds.get(tokens[0])!, token: tokens[0], pg: p.pg, pd: p.pd, designation: p.designation };
      }
    }
    throw new Error("ref inconnue: " + primaryRefToken);
  };

  const now = Date.now();
  let movementPrev = (token: string) => stock.get(token)!;
  const apply = (token: string, delta: number) => {
    const prev = movementPrev(token);
    const next = prev + delta;
    stock.set(token, next);
    return { prev, next };
  };

  // Entrées de stock (fournisseurs)
  for (const e of [
    { token: "7701207132", qty: 6, days: 2, h: 9, doc: "BL-2489", reason: "Livraison fournisseur Bosch" },
    { token: "8200371661", qty: 10, days: 3, h: 16, doc: "BL-2502", reason: "Livraison fournisseur" },
  ] as const) {
    const part = get(e.token);
    const { prev, next } = apply(part.token, e.qty);
    await db.insert(stockMovements).values({
      partId: part.id,
      partReference: part.token,
      type: "entree",
      quantity: String(e.qty),
      previousStock: String(prev),
      newStock: String(next),
      userName: "Administrateur",
      reason: e.reason,
      documentRef: e.doc,
      createdAt: new Date(now - e.days * D + e.h * H - 8 * H),
    });
  }

  // Un ajustement d'inventaire
  {
    const part = get("7701207704");
    const { prev, next } = apply(part.token, 1);
    await db.insert(stockMovements).values({
      partId: part.id,
      partReference: part.token,
      type: "ajustement_pos",
      quantity: "1",
      previousStock: String(prev),
      newStock: String(next),
      userName: "Administrateur",
      reason: "Écart d'inventaire corrigé",
      createdAt: new Date(now - 1 * D - 5 * H),
    });
  }

  // Ventes de démonstration (2 aujourd'hui)
  const demoSales: Array<{
    client: string;
    when: Date;
    items: Array<{ token: string; qty: number; priceType: "gros" | "detail" }>;
  }> = [
    {
      client: "Atelier Moderne Auto",
      when: new Date(now - 3 * D - 4 * H),
      items: [{ token: "7701477017", qty: 1, priceType: "gros" }],
    },
    {
      client: "M. Benali",
      when: new Date(now - 1 * D - 6 * H),
      items: [{ token: "8200497032", qty: 2, priceType: "detail" }],
    },
    {
      client: "SARL Pièces & Services",
      when: new Date(now - 5 * H - 20 * 60000),
      items: [
        { token: "7703800107", qty: 2, priceType: "gros" },
        { token: "224018760R", qty: 1, priceType: "detail" },
      ],
    },
    {
      client: "Client comptoir",
      when: new Date(now - 2 * H),
      items: [{ token: "7701207132", qty: 1, priceType: "detail" }],
    },
  ];

  const soldMap = new Map<string, number>();
  for (const s of demoSales) {
    const [sale] = await db
      .insert(sales)
      .values({ clientName: s.client, userName: "Administrateur", createdAt: s.when })
      .returning();
    let total = 0;
    for (const item of s.items) {
      const part = get(item.token);
      const { prev, next } = apply(part.token, -item.qty);
      const unitPrice = item.priceType === "gros" ? part.pg : part.pd;
      const lineTotal = unitPrice * item.qty;
      total += lineTotal;
      soldMap.set(part.token, (soldMap.get(part.token) ?? 0) + item.qty);
      await db.insert(saleItems).values({
        saleId: sale.id,
        partId: part.id,
        partReference: part.token,
        designation: part.designation,
        quantity: String(item.qty),
        unitPrice: String(unitPrice),
        priceType: item.priceType,
        lineTotal: String(lineTotal),
      });
      await db.insert(stockMovements).values({
        partId: part.id,
        partReference: part.token,
        type: "vente",
        quantity: String(item.qty),
        previousStock: String(prev),
        newStock: String(next),
        userName: "Administrateur",
        reason: "Vente",
        saleId: sale.id,
        createdAt: s.when,
      });
    }
    await db
      .update(sales)
      .set({ number: `V-${String(sale.id).padStart(5, "0")}`, totalAmount: String(total), itemCount: s.items.length })
      .where(sql`id = ${sale.id}`);
  }

  // Synchronise currentStock / soldQuantity pour chaque pièce
  for (const p of DEMO) {
    const tokens = splitReferences(p.ref);
    const token = tokens[0];
    await db
      .update(parts)
      .set({
        currentStock: String(stock.get(token)!),
        soldQuantity: String(soldMap.get(token) ?? 0),
      })
      .where(sql`id = ${partIds.get(token)!}`);
  }

  await db.insert(vehicles).values([
    { brand: "Renault", model: "Clio III", yearFrom: 2005, yearTo: 2012, engine: "1.5 dCi", fuel: "Diesel" },
    { brand: "Renault", model: "Megane II", yearFrom: 2002, yearTo: 2009, engine: "1.9 dCi", fuel: "Diesel" },
    { brand: "Peugeot", model: "206", yearFrom: 1998, yearTo: 2012, engine: "1.4 HDi", fuel: "Diesel" },
  ]);

  await db.insert(importBatches).values({
    filename: "inventaire_demo.xlsx (données de démonstration)",
    status: "demo",
    totalRows: DEMO.length,
    created: DEMO.length,
    updated: 0,
    skipped: 0,
    invalid: 0,
    duplicates: 0,
  });

  console.log(`Seed terminé : ${DEMO.length} pièces de démonstration insérées.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
