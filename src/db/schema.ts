import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Utilisateurs (audit léger, pas d'authentification complexe en V1)
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("employe"),
  username: text("username"),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Paramètres applicatifs (clé / valeur)
// ---------------------------------------------------------------------------
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// ---------------------------------------------------------------------------
// Référentiels : marques, catégories, fournisseurs
// ---------------------------------------------------------------------------
export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Pièces détachées automobiles
// ---------------------------------------------------------------------------
export const parts = pgTable(
  "parts",
  {
    id: serial("id").primaryKey(),
    // Référence principale (premier jeton de la cellule Excel, normalisé)
    reference: text("reference").notNull(),
    // Valeur brute d'origine du fichier Excel (ex: "7703800107 / 8200651172")
    referenceRaw: text("reference_raw"),
    designation: text("designation").notNull(),
    brandId: integer("brand_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    supplierId: integer("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    // Prix d'Achat / Prix Gros / Prix Détail — libellés métier conservés
    purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    wholesalePrice: numeric("wholesale_price", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    retailPrice: numeric("retail_price", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    initialStock: numeric("initial_stock", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    currentStock: numeric("current_stock", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    soldQuantity: numeric("sold_quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    minStock: numeric("min_stock", { precision: 14, scale: 3 })
      .notNull()
      .default("2"),
    unit: text("unit").notNull().default("U"), // UM
    location: text("location"), // Rayon
    description: text("description"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("parts_reference_idx").on(t.reference),
    index("parts_reference_lower_idx").on(t.reference),
    index("parts_designation_idx").on(t.designation),
    index("parts_location_idx").on(t.location),
    index("parts_brand_idx").on(t.brandId),
  ],
);

// ---------------------------------------------------------------------------
// Références alternatives (recherchables : "7703800107 / 8200651172")
// ---------------------------------------------------------------------------
export const partReferences = pgTable(
  "part_references",
  {
    id: serial("id").primaryKey(),
    partId: integer("part_id")
      .notNull()
      .references(() => parts.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("part_references_ref_idx").on(t.reference),
    index("part_references_ref_lower_idx").on(t.reference),
    index("part_references_part_idx").on(t.partId),
  ],
);

// ---------------------------------------------------------------------------
// Images produits — UNE image canonique par pièce, réutilisée partout
// La table `images` ne contient QUE l'image actuellement courante. Les
// remplacements successifs sont archivés dans `image_versions` (fichier
// conservé sur disque), ce qui rend l'ensemble du flux entièrement réversible.
// ---------------------------------------------------------------------------
export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  partId: integer("part_id")
    .notNull()
    .unique()
    .references(() => parts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name"),
  mime: text("mime"),
  size: integer("size"),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Historique / provenance des images produits (réversibilité).
// Chaque version correspond à un fichier sur disque qui n'est JAMAIS écrasé ni
// supprimé immédiatement : on peut restaurer n'importe quelle photo antérieure.
// source : 'upload' | 'pdf_extract' | 'seed' | 'restore' | 'import'
// ---------------------------------------------------------------------------
export const imageVersions = pgTable(
  "image_versions",
  {
    id: serial("id").primaryKey(),
    partId: integer("part_id")
      .notNull()
      .references(() => parts.id, { onDelete: "cascade" }),
    // Numéro de version de la pièce (1, 2, 3, …) — unique par pièce.
    versionNo: integer("version_no").notNull().default(1),
    filename: text("filename").notNull(),
    originalName: text("original_name"),
    mime: text("mime"),
    size: integer("size"),
    source: text("source").notNull().default("upload"),
    // Provenance d'une photo issue du catalogue PDF.
    token: text("token"),
    sourceRel: text("source_rel"),
    // Provenance catalogue détaillée : page du PDF, référence lue/associée,
    // confiance de l'appariement lors de la sauvegarde.
    pdfPage: integer("pdf_page"),
    pdfReference: text("pdf_reference"),
    confidence: text("confidence"),
    note: text("note"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("image_versions_part_idx").on(t.partId),
    uniqueIndex("image_versions_part_version_idx").on(t.partId, t.versionNo),
  ],
);

// ---------------------------------------------------------------------------
// Ventes
// ---------------------------------------------------------------------------
export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  number: text("number"),
  clientName: text("client_name"),
  userName: text("user_name"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  itemCount: integer("item_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const saleItems = pgTable(
  "sale_items",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    partId: integer("part_id").references(() => parts.id, {
      onDelete: "set null",
    }),
    partReference: text("part_reference"), // instantané pour l'historique
    designation: text("designation"), // instantané
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    priceType: text("price_type").notNull().default("detail"), // gros | detail
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)],
);

// ---------------------------------------------------------------------------
// Mouvements de stock — audit de chaque modification
// ---------------------------------------------------------------------------
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    partId: integer("part_id").references(() => parts.id, {
      onDelete: "set null",
    }),
    partReference: text("part_reference"), // instantané
    // entree | vente | retour | sortie | ajustement_pos | ajustement_neg
    type: text("type").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    previousStock: numeric("previous_stock", { precision: 14, scale: 3 })
      .notNull(),
    newStock: numeric("new_stock", { precision: 14, scale: 3 }).notNull(),
    userName: text("user_name"),
    reason: text("reason"),
    documentRef: text("document_ref"),
    saleId: integer("sale_id").references(() => sales.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("movements_part_idx").on(t.partId),
    index("movements_type_idx").on(t.type),
    index("movements_date_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Lots d'import Excel (traçabilité)
// ---------------------------------------------------------------------------
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  status: text("status").notNull().default("termine"),
  totalRows: integer("total_rows").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  invalid: integer("invalid").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Véhicules & compatibilité (structure prête, aucune donnée inventée)
// ---------------------------------------------------------------------------
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // ex: Renault, Peugeot
  model: text("model").notNull(), // ex: Clio III
  yearFrom: integer("year_from"),
  yearTo: integer("year_to"),
  engine: text("engine"), // ex: 1.5 dCi
  fuel: text("fuel"), // Essence | Diesel | ...
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const compatibilities = pgTable(
  "compatibilities",
  {
    id: serial("id").primaryKey(),
    partId: integer("part_id")
      .notNull()
      .references(() => parts.id, { onDelete: "cascade" }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    oemReference: text("oem_reference"),
    source: text("source"), // Fournisseur | Constructeur | Mesure | Autre
    verified: boolean("verified").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("compat_part_idx").on(t.partId),
    index("compat_vehicle_idx").on(t.vehicleId),
  ],
);
