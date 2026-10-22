import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/petservice/auth";

/** GET /api/admin/notifications — log de envíos WhatsApp/in-app (auditoría) */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;
  const notifications = await db.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return NextResponse.json({ notifications });
}
