"use client";

import { useEffect, useState, useRef } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { NativePlayerCore, type StreamResolution } from "./native-player";
import { cn } from "@/lib/utils";

interface InlinePlayerModalProps {
  open: boolean;
  onClose: () => void;
  stream: StreamResolution | null;
  resolving: boolean;
  title: string;
  notes?: { id: string; name: string; url: string; note?: string }[];
}

export function InlinePlayerModal({
  open,
  onClose,
  stream,
  resolving,
  title,
  notes,
}: InlinePlayerModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80 backdrop-blur-sm sb-fade-up"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl mx-4 rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close player"
          >
            <X size={16} />
          </button>
        </div>
        <div className="relative w-full bg-black">
          {resolving ? (
            <div className="flex aspect-video w-full items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/75">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs">Fetching stream…</span>
              </div>
            </div>
          ) : stream?.playable && stream.url ? (
            <NativePlayerCore
              stream={stream}
              title={title}
              notes={notes}
              fullPage={false}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center">
              <div className="flex flex-col items-center gap-2 px-6 text-center">
                <AlertCircle size={28} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {stream?.reason ?? "Could not load this stream right now."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function classifyUrl(url: string): StreamResolution["kind"] {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".m3u8")) return "hls";
  if (clean.endsWith(".mpd")) return "dash";
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return "mp4";
  return "hls";
}

export function useInlineStream(
  liveClass: {
    id: string;
    batchId: string;
    subjectSlug: string;
    videoId: string;
    title: string;
    status: string;
  } | null,
) {
  const [stream, setStream] = useState<StreamResolution | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!liveClass) {
      setStream(null);
      return;
    }

    let alive = true;

    const resolve = async () => {
      setResolving(true);
      setStream(null);

      // If we already have a videoId, try the stream resolver first
      if (liveClass.videoId) {
        try {
          const res = await fetch(`/api/streams/${encodeURIComponent(liveClass.videoId)}`);
          const data = await res.json();
          if (alive && data?.success && data.playable) {
            setStream(data);
            setResolving(false);
            return;
          }
        } catch {
          /* fall through */
        }
      }

      // Fallback: fetch lecture detail to get stream info
      if (liveClass.subjectSlug && liveClass.id) {
        try {
          const res = await fetch(
            `/api/batches/${liveClass.batchId}/subjects/${encodeURIComponent(liveClass.subjectSlug)}/schedule/${liveClass.id}`,
          );
          const data = await res.json();
          if (!alive) return;

          if (data?.success && data.lecture) {
            const lec = data.lecture;
            const type = (lec.urlType ?? "youtube").toLowerCase();
            if (type === "youtube" && (lec.videoId || lec.videoUrl)) {
              setStream({
                playable: true,
                kind: "youtube",
                url: lec.videoId || lec.videoUrl,
                engine: "native",
              });
              setResolving(false);
              return;
            }
            if (lec.videoUrl) {
              setStream({
                playable: true,
                kind: classifyUrl(lec.videoUrl),
                url: lec.videoUrl,
                engine: "native",
              });
              setResolving(false);
              return;
            }
            // Try videoApiId through the stream resolver
            const apiId = lec.videoApiId ?? lec.videoId ?? "";
            if (apiId) {
              const rawUrl = lec.videoUrl || "";
              const q = rawUrl ? `?url=${encodeURIComponent(rawUrl)}` : "";
              try {
                const sres = await fetch(`/api/streams/${encodeURIComponent(apiId)}${q}`);
                const sdata = await sres.json();
                if (alive && sdata?.success && sdata.playable) {
                  setStream(sdata);
                  setResolving(false);
                  return;
                }
              } catch {
                /* fall through */
              }
            }
          }
        } catch {
          /* fall through */
        }
      }

      if (alive) {
        setStream({
          playable: false,
          kind: "unknown",
          url: "",
          reason: "No stream available for this class yet.",
        });
        setResolving(false);
      }
    };

    void resolve();
    return () => {
      alive = false;
    };
  }, [liveClass]);

  return { stream, resolving };
}
