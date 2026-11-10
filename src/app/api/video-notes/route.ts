import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/video-notes?contentId=... */
export async function GET(req: NextRequest) {
  try {
    const contentId = req.nextUrl.searchParams.get("contentId");
    if (!contentId) {
      return NextResponse.json({ success: false, error: "contentId required" }, { status: 400 });
    }
    const items = await db.videoNote.findMany({
      where: { userId: "local", contentId },
      orderBy: { timestamp: "asc" },
    });
    return NextResponse.json({ success: true, items });
  } catch (err) {
    return NextResponse.json(
      { success: false, items: [], error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}

/** POST /api/video-notes — create a timestamped note */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, batchId, subjectSlug, timestamp, text } = body ?? {};
    if (!contentId || !batchId || text == null) {
      return NextResponse.json({ success: false, error: "contentId, batchId, text required" }, { status: 400 });
    }
    const created = await db.videoNote.create({
      data: {
        userId: "local",
        contentId: String(contentId),
        batchId: String(batchId),
        subjectSlug: String(subjectSlug ?? ""),
        timestamp: Number(timestamp) || 0,
        text: String(text),
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

/** DELETE /api/video-notes?id=... */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await db.videoNote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}
