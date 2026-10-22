import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/petservice/auth";

/** GET /api/admin/reviews — todas las reseñas para moderación */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;
  const reviews = await db.review.findMany({
    include: {
      provider: { select: { businessName: true, id: true } },
      booking: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return NextResponse.json({ reviews });
}
