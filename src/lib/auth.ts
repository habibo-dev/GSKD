// ---------------------------------------------------------------------------
// Authentification légère de production : ADMIN / EMPLOYÉ.
//
// - Cookie httpOnly signé (HMAC-SHA256) contenant { userId, role, exp }.
// - AUCUNE donnée secrète côté client.
// - `AUTH_ENABLED` est contrôlé par les paramètres applicatifs (`authEnabled`)
//   afin que l'application existante continue à fonctionner sans régression
//   tant que le client n'a pas activé la sécurité multi-utilisateurs.
//
// Le service est activé par `enableRoleAuth()` ; le bootstrap idempotent
// `ensureAuthReady()` crée les colonnes nécessaires (si absentes) et un compte
// administrateur initial (username/password via env, sinon admin/admin).
// ---------------------------------------------------------------------------

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getSettings } from "@/lib/settings";

export type Role = "admin" | "employe";

export type AuthUser = {
  id: number;
  name: string;
  username: string;
  role: Role;
};

const COOKIE_NAME = "autostock_session";
const DEFAULT_SECRET = "autostock-dev-secret-change-me";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h

let ready = false;

function secret(): string {
  return process.env.AUTH_SECRET || DEFAULT_SECRET;
}

function hashPassword(password: string): string {
  return createHmac("sha256", secret())
    .update(`autostock-password::${password}`)
    .digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  const expected = hashPassword(password);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(hash || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function signCookie(payload: string): string {
  return `${payload}.${sign(payload)}`;
}

function parseSignedCookie(value: string): string | null {
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return payload;
}

function makeToken(user: { id: number; username: string; role: Role }): string {
  return signCookie(
    Buffer.from(
      JSON.stringify({
        uid: user.id,
        username: user.username,
        role: user.role,
        exp: Date.now() + SESSION_TTL_SECONDS * 1000,
      }),
    ).toString("base64url"),
  );
}

export async function setSessionCookie(user: { id: number; username: string; role: Role }) {
  const c = await cookies();
  const value = makeToken(user);
  c.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const c = await cookies();
  const raw = c.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = parseSignedCookie(raw);
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid: number;
      username: string;
      role: Role;
      exp: number;
    };
    if (!decoded.uid || decoded.exp < Date.now()) return null;
    const [user] = await db
      .select({ id: users.id, name: users.name, username: users.username, role: users.role, active: users.active })
      .from(users)
      .where(eq(users.id, decoded.uid))
      .limit(1);
    if (!user || user.active === false) return null;
    return {
      id: user.id,
      name: user.name,
      username: user.username ?? "",
      role: user.role === "admin" ? "admin" : "employe",
    };
  } catch {
    return null;
  }
}

export async function isAuthEnabled(): Promise<boolean> {
  const cfg = await getSettings();
  return cfg.authEnabled;
}

/** Vrai si la sécurité est activée ET l'utilisateur est admin. */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  if (!(await isAuthEnabled())) return null;
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Action réservée à l'administrateur." }, { status: 403 });
  }
  return null;
}

/** Validation POST /api/auth : ne renvoie jamais le mot de passe. */
export async function login(username: string, password: string): Promise<AuthUser | null> {
  await ensureAuthReady();
  const clean = username.trim();
  if (!clean || !password) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, clean.toLowerCase()))
    .limit(1);
  if (!user || user.active === false) return null;
  if (!verifyPassword(password, user.passwordHash ?? "")) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? "",
    role: user.role === "admin" ? "admin" : "employe",
  };
}

/**
 * Bootstrap idempotent (appelé par les routes d'authentification) :
 * ajoute les colonnes si elles manquent, crée les index et garantit un admin.
 */
export async function ensureAuthReady(): Promise<void> {
  if (ready) return;
  try {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(lower(username));
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS part_references_ref_lower_idx ON part_references(lower(reference));
      CREATE INDEX IF NOT EXISTS parts_reference_lower_idx ON parts(lower(reference));
      CREATE INDEX IF NOT EXISTS stock_movements_part_date_idx ON stock_movements(part_id, created_at DESC);
    `);

    const adminUsername = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "admin";
    const adminHash = hashPassword(adminPassword);
    await db.execute(sql`
      INSERT INTO users (name, role, username, password_hash, active)
      VALUES (${"Administrateur"}, ${"admin"}, ${adminUsername}, ${adminHash}, true)
      ON CONFLICT (lower(username)) DO NOTHING
    `);
    // Si un utilisateur préexistant n'a pas de mot de passe, on le met à jour.
    await db.execute(sql`
      UPDATE users SET password_hash = ${adminHash}, active = true
      WHERE lower(username) = ${adminUsername} AND (password_hash IS NULL OR password_hash = '')
    `);
    ready = true;
  } catch {
    // En cas de base non migrée / non disponible, l'authentification ne doit
    // pas faire planter le build ou les pages de lecture.
  }
}

export function randomPassword(): string {
  return randomBytes(9).toString("base64url");
}
