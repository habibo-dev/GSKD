import { NextResponse } from "next/server";
import { getAuthUser, isAuthEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const [enabled, user] = await Promise.all([isAuthEnabled(), getAuthUser()]);
  return NextResponse.json({ enabled, user });
}
