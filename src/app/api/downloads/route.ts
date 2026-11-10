import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/downloads — list downloaded content */
export async function GET() {
  try {
    const items = await db.downloadCache.findMany({
      where: { userId: "local" },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ success: true, items });
  } catch (err) {
    return NextResponse.json(
      { success: false, items: [], error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}

/** POST /api/downloads — register a download */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, batchId, lectureTitle, kind, url, fileSize, status, filePath } = body ?? {};
    if (!contentId || !batchId || !kind) {
      return NextResponse.json({ success: false, error: "contentId, batchId, kind required" }, { status: 400 });
    }
    const saved = await db.downloadCache.upsert({
      where: { userId_contentId_kind: { userId: "local", contentId: String(contentId), kind: String(kind) } },
      create: {
        userId: "local",
        contentId: String(contentId),
        batchId: String(batchId),
        lectureTitle: String(lectureTitle ?? ""),
        kind: String(kind),
        url: String(url ?? ""),
        fileSize: Number(fileSize) || 0,
        status: String(status ?? "pending"),
        filePath: filePath ? String(filePath) : null,
      },
      update: {
        status: String(status ?? "pending"),
        fileSize: Number(fileSize) || 0,
        filePath: filePath ? String(filePath) : null,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json({ success: true, item: saved });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}

/** DELETE /api/downloads?id=... */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await db.downloadCache.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "db error" },
      { status: 500 }
    );
  }
}
