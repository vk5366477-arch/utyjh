"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageCircle, Send, Trash2, Clock, X, Reply } from "lucide-react";
import { cn } from "@/lib/utils";

interface DoubtItem {
  id: string;
  userName: string;
  timestamp: number;
  text: string;
  replyToId: string | null;
  createdAt: string;
}

interface DoubtWallProps {
  contentId: string;
  batchId: string;
  subjectSlug: string;
  currentTimestamp: number;
  onSeek?: (seconds: number) => void;
  onClose: () => void;
}

function fmtTime(s: number): string {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function DoubtWall({
  contentId,
  batchId,
  subjectSlug,
  currentTimestamp,
  onSeek,
  onClose,
}: DoubtWallProps) {
  const [doubts, setDoubts] = useState<DoubtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const loadDoubts = useCallback(async () => {
    try {
      const res = await fetch(`/api/doubts?contentId=${encodeURIComponent(contentId)}`);
      const d = await res.json();
      setDoubts(d?.items ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, [contentId]);

  useEffect(() => { void loadDoubts(); }, [loadDoubts]);

  const submit = async () => {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/doubts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId, batchId, subjectSlug,
          timestamp: replyTo ? 0 : Math.floor(currentTimestamp),
          text: text.trim(),
          replyToId: replyTo,
        }),
      });
      const d = await res.json();
      if (d?.success) {
        setText("");
        setReplyTo(null);
        void loadDoubts();
      }
    } catch { /* noop */ }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/doubts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setDoubts((prev) => prev.filter((d) => d.id !== id && d.replyToId !== id));
    } catch { /* noop */ }
  };

  const topLevel = doubts.filter((d) => !d.replyToId);
  const repliesOf = (id: string) => doubts.filter((d) => d.replyToId === id);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
        <MessageCircle size={15} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">Doubt Wall</h3>
        <span className="ml-auto text-xs text-muted-foreground">{topLevel.length}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
          <X size={15} />
        </button>
      </div>

      {/* Compose */}
      <div className="border-b border-border px-4 py-3 shrink-0">
        {replyTo && (
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Reply size={11} /> Replying to a question
            <button onClick={() => setReplyTo(null)} className="ml-auto text-primary hover:underline cursor-pointer">cancel</button>
          </div>
        )}
        {!replyTo && (
          <div className="mb-2 flex items-center gap-2">
            <Clock size={12} className="text-primary" />
            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
              At {fmtTime(currentTimestamp)}
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={replyTo ? "Write a reply..." : "Ask a question about this moment..."}
            className="flex-1 min-h-[50px] max-h-[100px] resize-none rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-primary transition-colors sb-scroll"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
          />
        </div>
        <button
          onClick={() => void submit()}
          disabled={!text.trim()}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40 cursor-pointer"
        >
          <Send size={12} /> {replyTo ? "Reply" : "Post"}
        </button>
      </div>

      {/* Doubts list */}
      <div className="flex-1 overflow-y-auto sb-scroll min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
            <MessageCircle size={24} className="text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No doubts yet. Be the first to ask!</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {topLevel.map((doubt) => (
              <div key={doubt.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-primary">
                    {doubt.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{doubt.userName}</span>
                      <span className="text-[10px] text-muted-foreground">{fmtRelative(doubt.createdAt)}</span>
                    </div>
                    {doubt.timestamp > 0 && onSeek && (
                      <button
                        onClick={() => onSeek(doubt.timestamp)}
                        className="mt-1 flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary hover:brightness-95 transition cursor-pointer"
                      >
                        <Clock size={10} /> {fmtTime(doubt.timestamp)}
                      </button>
                    )}
                    <p className="mt-1 text-xs leading-relaxed text-foreground/90 break-words">{doubt.text}</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <button
                        onClick={() => setReplyTo(doubt.id)}
                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition cursor-pointer"
                      >
                        <Reply size={10} /> Reply
                      </button>
                      <button
                        onClick={() => void remove(doubt.id)}
                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-destructive transition cursor-pointer"
                      >
                        <Trash2 size={10} /> Delete
                      </button>
                    </div>
                    {/* Replies */}
                    {repliesOf(doubt.id).length > 0 && (
                      <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
                        {repliesOf(doubt.id).map((reply) => (
                          <div key={reply.id} className="flex items-start gap-2">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground">
                              {reply.userName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-foreground">{reply.userName}</span>
                                <span className="text-[9px] text-muted-foreground">{fmtRelative(reply.createdAt)}</span>
                              </div>
                              <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/80 break-words">{reply.text}</p>
                              <button
                                onClick={() => void remove(reply.id)}
                                className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-muted-foreground hover:text-destructive transition cursor-pointer"
                              >
                                <Trash2 size={9} /> Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
