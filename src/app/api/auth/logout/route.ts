import { NextResponse, after } from "next/server";
import { clearSessionCookie } from "@/lib/petservice/auth";
import { flushDb } from "@/lib/db";

/** POST /api/auth/logout — borra la cookie de sesión */
export async function POST() {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
