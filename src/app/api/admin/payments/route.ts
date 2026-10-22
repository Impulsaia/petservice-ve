import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/petservice/auth";

/** GET /api/admin/payments — cola de conciliación (pendientes primero) */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;
  const payments = await db.payment.findMany({
    include: {
      booking: {
        select: {
          code: true,
          status: true,
          priceUsd: true,
          priceBs: true,
          client: { select: { name: true } },
          provider: { select: { businessName: true } },
          service: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ payments });
}
