"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, Trash2, X, CheckCircle2, Loader2, FileText, Video, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DownloadItem {
  id: string;
  contentId: string;
  batchId: string;
  lectureTitle: string;
  kind: string;
  url: string;
  fileSize: number;
  status: string;
  createdAt: string;
}

interface DownloadButtonProps {
  contentId: string;
  batchId: string;
  lectureTitle: string;
  kind: "video" | "pdf";
  url: string;
}

/** Small inline download button for use in player/attachment areas. */
export function DownloadButton({ contentId, batchId, lectureTitle, kind, url }: DownloadButtonProps) {
  const [status, setStatus] = useState<string>("idle");

  useEffect(() => {
    fetch("/api/downloads")
      .then((r) => r.json())
      .then((d) => {
        const existing = (d?.items ?? []).find(
          (item: DownloadItem) => item.contentId === contentId && item.kind === kind
        );
        if (existing) setStatus(existing.status);
      })
      .catch(() => {});
  }, [contentId, kind]);

  const startDownload = async () => {
    setStatus("downloading");
    try {
      // For PDFs, trigger a browser download
      if (kind === "pdf") {
        const a = document.createElement("a");
        a.href = url.startsWith("/") ? url : `/api/pdf?url=${encodeURIComponent(url)}`;
        a.download = `${lectureTitle}.pdf`;
        a.click();
      }
      // Register in cache
      await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId, batchId, lectureTitle, kind, url,
          status: "complete", fileSize: 0,
        }),
      });
      setStatus("complete");
    } catch {
      setStatus("failed");
    }
  };

  if (status === "complete") {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
        <CheckCircle2 size={13} /> Saved
      </span>
    );
  }

  if (status === "downloading") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
        <Loader2 size={13} className="animate-spin" /> Saving...
      </span>
    );
  }

  return (
    <button
      onClick={() => void startDownload()}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer"
    >
      <Download size={13} /> Save offline
    </button>
  );
}

/** Full downloads list view. */
export function DownloadsList({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/downloads");
      const d = await res.json();
      setItems(d?.items ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    try {
      await fetch(`/api/downloads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch { /* noop */ }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
        <Download size={15} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">Downloads</h3>
        <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sb-scroll min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
            <Download size={24} className="text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No downloads yet. Save lectures and notes for offline access.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  item.kind === "video" ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"
                )}>
                  {item.kind === "video" ? <Video size={16} /> : <FileText size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{item.lectureTitle}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {item.status === "complete" && (
                      <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <CheckCircle2 size={10} /> Available offline
                      </span>
                    )}
                    {item.status === "downloading" && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Loader2 size={10} className="animate-spin" /> Downloading...
                      </span>
                    )}
                    {item.status === "failed" && (
                      <span className="flex items-center gap-1 text-[10px] text-red-400">
                        <AlertCircle size={10} /> Failed
                      </span>
                    )}
                    {item.fileSize > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {(item.fileSize / 1048576).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void remove(item.id)}
                  className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
