import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/petservice/auth";

/** POST /api/auth/logout — borra la cookie de sesión */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
