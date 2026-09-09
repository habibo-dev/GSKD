// ---------------------------------------------------------------------------
// Création idempotente du schéma PostgreSQL.
//
// Utilisé par `npm run db:setup` (et recommandé lors du premier déploiement
// d'un environnement avec une base PostgreSQL vide). L'application ne dépend
// pas de migrations externes : les tables sont créées si elles n'existent pas.
// ---------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { db, pool, pglite } from "@/db/index";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'employe',
  username text,
  password_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text
);

CREATE TABLE IF NOT EXISTS brands (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  phone text,
  email text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parts (
  id serial PRIMARY KEY,
  reference text NOT NULL,
  reference_raw text,
  designation text NOT NULL,
  brand_id integer REFERENCES brands(id) ON DELETE SET NULL,
  category_id integer REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  wholesale_price numeric(14,2) NOT NULL DEFAULT 0,
  retail_price numeric(14,2) NOT NULL DEFAULT 0,
  initial_stock numeric(14,3) NOT NULL DEFAULT 0,
  current_stock numeric(14,3) NOT NULL DEFAULT 0,
  sold_quantity numeric(14,3) NOT NULL DEFAULT 0,
  min_stock numeric(14,3) NOT NULL DEFAULT 2,
  unit text NOT NULL DEFAULT 'U',
  location text,
  description text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS part_references (
  id serial PRIMARY KEY,
  part_id integer NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  reference text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS images (
  id serial PRIMARY KEY,
  part_id integer NOT NULL UNIQUE REFERENCES parts(id) ON DELETE CASCADE,
  filename text NOT NULL,
  original_name text,
  mime text,
  size integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS image_versions (
  id serial PRIMARY KEY,
  part_id integer NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  version_no integer NOT NULL DEFAULT 1,
  filename text NOT NULL,
  original_name text,
  mime text,
  size integer,
  source text NOT NULL DEFAULT 'upload',
  token text,
  source_rel text,
  pdf_page integer,
  pdf_reference text,
  confidence text,
  note text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE image_versions ADD COLUMN IF NOT EXISTS pdf_page integer;
ALTER TABLE image_versions ADD COLUMN IF NOT EXISTS pdf_reference text;
ALTER TABLE image_versions ADD COLUMN IF NOT EXISTS confidence text;

CREATE TABLE IF NOT EXISTS sales (
  id serial PRIMARY KEY,
  number text,
  client_name text,
  user_name text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id serial PRIMARY KEY,
  sale_id integer NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  part_id integer REFERENCES parts(id) ON DELETE SET NULL,
  part_reference text,
  designation text,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  price_type text NOT NULL DEFAULT 'detail',
  line_total numeric(14,2) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id serial PRIMARY KEY,
  part_id integer REFERENCES parts(id) ON DELETE SET NULL,
  part_reference text,
  type text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  previous_stock numeric(14,3) NOT NULL,
  new_stock numeric(14,3) NOT NULL,
  user_name text,
  reason text,
  document_ref text,
  sale_id integer REFERENCES sales(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id serial PRIMARY KEY,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'termine',
  total_rows integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  invalid integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id serial PRIMARY KEY,
  brand text NOT NULL,
  model text NOT NULL,
  year_from integer,
  year_to integer,
  engine text,
  fuel text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compatibilities (
  id serial PRIMARY KEY,
  part_id integer NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  vehicle_id integer NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  oem_reference text,
  source text,
  verified boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parts_reference_idx ON parts(reference);
CREATE INDEX IF NOT EXISTS parts_reference_lower_idx ON parts(lower(reference));
CREATE INDEX IF NOT EXISTS parts_designation_idx ON parts(designation);
CREATE INDEX IF NOT EXISTS parts_location_idx ON parts(location);
CREATE INDEX IF NOT EXISTS parts_brand_idx ON parts(brand_id);

CREATE INDEX IF NOT EXISTS part_references_ref_idx ON part_references(reference);
CREATE INDEX IF NOT EXISTS part_references_ref_lower_idx ON part_references(lower(reference));
CREATE INDEX IF NOT EXISTS part_references_part_idx ON part_references(part_id);

CREATE INDEX IF NOT EXISTS movements_part_idx ON stock_movements(part_id);
CREATE INDEX IF NOT EXISTS movements_type_idx ON stock_movements(type);
CREATE INDEX IF NOT EXISTS movements_date_idx ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS movements_part_date_idx ON stock_movements(part_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);

CREATE INDEX IF NOT EXISTS compat_part_idx ON compatibilities(part_id);
CREATE INDEX IF NOT EXISTS compat_vehicle_idx ON compatibilities(vehicle_id);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS image_versions_part_version_idx ON image_versions(part_id, version_no);
CREATE INDEX IF NOT EXISTS image_versions_part_idx ON image_versions(part_id);

-- Rétro-compatibilité : archive l'image canonique existante comme « version 1 »
-- afin qu'aucune image déjà en place ne soit perdue (idempotent).
INSERT INTO image_versions (part_id, version_no, filename, original_name, mime, size, source, is_current)
SELECT i.part_id, 1, i.filename, i.original_name, i.mime, i.size,
       CASE WHEN i.filename LIKE 'demo-%' THEN 'seed' ELSE 'import' END, true
FROM images i
WHERE NOT EXISTS (SELECT 1 FROM image_versions v WHERE v.part_id = i.part_id);
`;

export async function ensureSchema(): Promise<void> {
  if (pglite) {
    await pglite.exec(SCHEMA_SQL);
  } else if (pool) {
    await pool.query(SCHEMA_SQL);
  } else {
    await db.execute(sql.raw(SCHEMA_SQL));
  }
}
