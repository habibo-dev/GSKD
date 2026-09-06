import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  getAuthUser,
  isAuthEnabled,
  login,
  setSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = await isAuthEnabled();
  const user = await getAuthUser();
  return NextResponse.json({ enabled, user });
}

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const user = await login(String(body.username ?? ""), String(body.password ?? ""));
  if (!user) {
    return NextResponse.json({ error: "Identifiants incorrects." }, { status: 401 });
  }
  await setSessionCookie({ id: user.id, username: user.username, role: user.role });
  return NextResponse.json({ ok: true, user });
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
