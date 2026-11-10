import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/practice?contentId=... — past attempts for a lecture */
export async function GET(req: NextRequest) {
  try {
    const contentId = req.nextUrl.searchParams.get("contentId");
    if (!contentId) {
      return NextResponse.json({ success: false, error: "contentId required" }, { status: 400 });
    }
    const items = await db.practiceAttempt.findMany({
      where: { userId: "local", contentId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ success: true, items });
  } catch (err) {
    return NextResponse.json(
      { success: false, items: [], error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}

/** POST /api/practice — save a quiz attempt */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, batchId, questions, score, total } = body ?? {};
    if (!contentId || !batchId) {
      return NextResponse.json({ success: false, error: "contentId, batchId required" }, { status: 400 });
    }
    const created = await db.practiceAttempt.create({
      data: {
        userId: "local",
        contentId: String(contentId),
        batchId: String(batchId),
        questions: JSON.stringify(questions ?? []),
        score: Number(score) || 0,
        total: Number(total) || 0,
      },
    });
    return NextResponse.json({ success: true, item: created });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}
