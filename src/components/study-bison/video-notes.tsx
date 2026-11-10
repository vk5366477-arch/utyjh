"use client";

import { useEffect, useState, useCallback } from "react";
import { StickyNote, Trash2, Clock, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VideoNoteItem {
  id: string;
  timestamp: number;
  text: string;
  createdAt: string;
}

interface VideoNotesPanelProps {
  contentId: string;
  batchId: string;
  subjectSlug: string;
  currentTimestamp: number;
  onSeek: (seconds: number) => void;
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

export function VideoNotesPanel({
  contentId,
  batchId,
  subjectSlug,
  currentTimestamp,
  onSeek,
  onClose,
}: VideoNotesPanelProps) {
  const [notes, setNotes] = useState<VideoNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/video-notes?contentId=${encodeURIComponent(contentId)}`);
      const d = await res.json();
      setNotes(d?.items ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, [contentId]);

  useEffect(() => { void loadNotes(); }, [loadNotes]);

  const addNote = async () => {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/video-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId, batchId, subjectSlug,
          timestamp: Math.floor(currentTimestamp),
          text: text.trim(),
        }),
      });
      const d = await res.json();
      if (d?.success) {
        setText("");
        void loadNotes();
      }
    } catch { /* noop */ }
  };

  const deleteNote = async (id: string) => {
    try {
      await fetch(`/api/video-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch { /* noop */ }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
        <StickyNote size={15} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">My Notes</h3>
        <span className="ml-auto text-xs text-muted-foreground">{notes.length}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
          <X size={15} />
        </button>
      </div>

      {/* Add note */}
      <div className="border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={12} className="text-primary" />
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            At {fmtTime(currentTimestamp)}
          </span>
        </div>
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note at this moment..."
            className="flex-1 min-h-[60px] resize-none rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-primary transition-colors sb-scroll"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void addNote(); } }}
          />
        </div>
        <button
          onClick={() => void addNote()}
          disabled={!text.trim()}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40 cursor-pointer"
        >
          <Plus size={13} /> Save note
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto sb-scroll min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
            <StickyNote size={24} className="text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No notes yet. Tap &quot;Save note&quot; to bookmark a moment.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notes.map((note) => (
              <div key={note.id} className="group px-4 py-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => onSeek(note.timestamp)}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary hover:brightness-95 transition cursor-pointer"
                  >
                    <Clock size={10} /> {fmtTime(note.timestamp)}
                  </button>
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground break-words">{note.text}</p>
                  <button
                    onClick={() => void deleteNote(note.id)}
                    className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
