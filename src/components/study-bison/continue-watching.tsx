"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Play, ChevronRight } from "lucide-react";
import { GlassCard, SafeImage } from "./glass";

interface HistoryItem {
  id: string;
  contentId: string;
  batchId: string;
  batchName: string;
  subjectSlug: string;
  subjectName: string;
  topicId: string | null;
  topicName: string | null;
  lectureTitle: string;
  videoId: string | null;
  videoType: string;
  thumbnail: string | null;
  positionSec: number;
}

export function ContinueWatching() {
  const { navigate } = useApp();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const history: HistoryItem[] = (d?.items ?? [])
          .filter((h: HistoryItem) => h.positionSec > 5)
          .slice(0, 12);
        setItems(history);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading || items.length === 0) return null;

  const resume = (item: HistoryItem) => {
    navigate({
      view: "watch",
      batchId: item.batchId,
      batchName: item.batchName,
      subjectSlug: item.subjectSlug,
      subjectName: item.subjectName,
      topicId: item.topicId ?? undefined,
      topicName: item.topicName ?? undefined,
      contentId: item.contentId,
      lectureTitle: item.lectureTitle,
      videoId: item.videoId ?? undefined,
      videoType: item.videoType,
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Play size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-foreground">Continue Watching</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto sb-scroll pb-2 -mx-1 px-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => resume(item)}
            className="group shrink-0 w-56 text-left cursor-pointer"
          >
            <GlassCard hover className="overflow-hidden rounded-xl">
              <div className="relative aspect-video overflow-hidden bg-muted">
                <SafeImage
                  src={item.thumbnail ?? undefined}
                  alt={item.lectureTitle}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-ink-950/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                    <Play size={16} className="ml-0.5" />
                  </span>
                </div>
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, (item.positionSec / 3600) * 100))}%` }}
                  />
                </div>
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{item.lectureTitle}</p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.batchName}</p>
              </div>
            </GlassCard>
          </button>
        ))}
      </div>
    </section>
  );
}
