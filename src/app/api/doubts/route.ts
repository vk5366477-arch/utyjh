import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/doubts?contentId=... — fetch all doubts + replies for a lecture */
export async function GET(req: NextRequest) {
  try {
    const contentId = req.nextUrl.searchParams.get("contentId");
    if (!contentId) {
      return NextResponse.json({ success: false, error: "contentId required" }, { status: 400 });
    }
    const items = await db.doubt.findMany({
      where: { contentId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, items });
  } catch (err) {
    return NextResponse.json(
      { success: false, items: [], error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}

/** POST /api/doubts — post a question or reply */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, batchId, subjectSlug, timestamp, text, userName, replyToId } = body ?? {};
    if (!contentId || !batchId || !text) {
      return NextResponse.json({ success: false, error: "contentId, batchId, text required" }, { status: 400 });
    }
    const created = await db.doubt.create({
      data: {
        userId: "local",
        userName: String(userName ?? "Learner"),
        contentId: String(contentId),
        batchId: String(batchId),
        subjectSlug: String(subjectSlug ?? ""),
        timestamp: Number(timestamp) || 0,
        text: String(text),
        replyToId: replyToId ? String(replyToId) : null,
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

/** DELETE /api/doubts?id=... */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await db.doubt.deleteMany({ where: { OR: [{ id }, { replyToId: id }] } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}
