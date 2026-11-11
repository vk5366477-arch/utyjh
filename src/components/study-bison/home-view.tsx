"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getEnrolledBatchIds } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage, EmptyState } from "./glass";
import { ContinueWatching } from "./continue-watching";
import {
  Radio,
  ChevronRight,
  Play,
  Clock,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CatalogBatch {
  _id: string;
  name: string;
  byName: string;
  startDate?: string;
  language?: string;
  previewImage?: string;
  type?: string;
}

interface LiveClass {
  id: string;
  batchId: string;
  batchName: string;
  title: string;
  subject: string;
  startTime: string;
  endTime: string;
  thumbnail: string;
  duration: string;
  videoId: string;
  subjectSlug: string;
  subjectId: string;
  status: "live" | "upcoming" | "ended";
}

function classStatus(start: string, end: string): "live" | "upcoming" | "ended" {
  const now = Date.now();
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (Number.isNaN(s)) return "upcoming";
  if (now < s) return "upcoming";
  if (Number.isNaN(e) || now <= e) return "live";
  return "ended";
}

export function HomeView() {
  const { navigate } = useApp();
  const user = useAuth();
  const authLoading = user === undefined;
  const [enrolledBatches, setEnrolledBatches] = useState<CatalogBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingLive, setLoadingLive] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    setLoadingBatches(true);
    (async () => {
      try {
        const [catalogResponse, enrolledIds] = await Promise.all([
          fetch("/api/batches"),
          user ? getEnrolledBatchIds(user.uid) : Promise.resolve([] as string[]),
        ]);
        const data = await catalogResponse.json() as { success?: boolean; batches?: CatalogBatch[] };
        const catalog = data.success && Array.isArray(data.batches) ? data.batches : [];
        const enrolled = enrolledIds.map((id) => catalog.find((batch) => batch._id === id) ?? {
          _id: id,
          name: "Enrolled batch",
          byName: "",
        });
        if (!alive) return;
        setEnrolledBatches(enrolled);
        setSelectedBatchId((current) => enrolled.some((batch) => batch._id === current) ? current : enrolled[0]?._id ?? "");
      } catch {
        if (alive) {
          setEnrolledBatches([]);
          setSelectedBatchId("");
        }
      } finally {
        if (alive) setLoadingBatches(false);
      }
    })();
    return () => { alive = false; };
  }, [user, authLoading]);

  useEffect(() => {
    let alive = true;
    const loadLive = async () => {
      if (!selectedBatchId || enrolledBatches.length === 0) {
        setLiveClasses([]);
        setLoadingLive(false);
        return;
      }
      setLoadingLive(true);
      const batch = enrolledBatches.find((item) => item._id === selectedBatchId);
      try {
        const response = await fetch(`/api/batches/${selectedBatchId}/today`);
        const data = await response.json() as { classes?: Array<Record<string, unknown>> };
        const rows = Array.isArray(data.classes) ? data.classes : [];
        const classes = rows.map((item): LiveClass => ({
            id: typeof item.id === "string" ? item.id : "",
            batchId: selectedBatchId,
            batchName: batch?.name ?? "Enrolled batch",
            title: typeof item.title === "string" ? item.title : "Class",
            subject: typeof item.subject === "string" ? item.subject : "",
            startTime: typeof item.startTime === "string" ? item.startTime : "",
            endTime: typeof item.endTime === "string" ? item.endTime : "",
            thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : "",
            duration: typeof item.duration === "string" ? item.duration : "",
            videoId: typeof item.videoId === "string" ? item.videoId : "",
            subjectSlug: typeof item.subjectSlug === "string" ? item.subjectSlug : typeof item.subjectId === "string" ? item.subjectId : typeof item.batchSubjectId === "string" ? item.batchSubjectId : "",
            subjectId: typeof item.subjectId === "string" ? item.subjectId : typeof item.batchSubjectId === "string" ? item.batchSubjectId : "",
            status: classStatus(typeof item.startTime === "string" ? item.startTime : "", typeof item.endTime === "string" ? item.endTime : ""),
          }));
        classes.sort((a, b) => {
          const order = { live: 0, upcoming: 1, ended: 2 };
          if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        if (alive) setLiveClasses(classes);
      } catch {
        if (alive) setLiveClasses([]);
      } finally {
        if (alive) setLoadingLive(false);
      }
    };
    void loadLive();
    return () => {
      alive = false;
    };
  }, [enrolledBatches, selectedBatchId]);

  const liveCount = liveClasses.filter((c) => c.status === "live").length;

  const openLive = async (c: LiveClass) => {
    if (!c.id || !c.subjectSlug) {
      navigate({ view: "batch", batchId: c.batchId, batchName: c.batchName });
      return;
    }
    if (c.videoId) {
      navigate({ view: "watch", batchId: c.batchId, subjectSlug: c.subjectSlug, subjectName: c.subject, batchName: c.batchName, contentId: c.id, lectureTitle: c.title, videoId: c.videoId });
      return;
    }
    try {
      const response = await fetch(`/api/batches/${c.batchId}/subjects/${encodeURIComponent(c.subjectSlug)}/schedule/${c.id}`);
      const data = await response.json() as { success?: boolean; lecture?: { videoId?: string; videoUrl?: string; urlType?: string; title?: string } };
      if (data.success && data.lecture) {
        navigate({ view: "watch", batchId: c.batchId, subjectSlug: c.subjectSlug, subjectName: c.subject, batchName: c.batchName, contentId: c.id, lectureTitle: data.lecture.title || c.title, videoId: data.lecture.videoId || data.lecture.videoUrl || "", videoType: data.lecture.urlType || "youtube" });
      }
    } catch {
      navigate({ view: "batch", batchId: c.batchId, batchName: c.batchName });
    }
  };

  const selectedBatch = enrolledBatches.find((batch) => batch._id === selectedBatchId);

  return (
    <main className="w-full min-w-0 flex-1 text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Header */}
        <header className="sb-fade-up flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Learning schedule</p>
            <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <span
                className={cn(
                  "inline-flex h-2.5 w-2.5 rounded-full",
                  liveCount > 0 ? "animate-pulse bg-destructive" : "bg-muted-foreground/40"
                )}
                aria-hidden="true"
              />
              Today&apos;s classes
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {liveCount > 0 ? `${liveCount} live now` : "All scheduled classes for the selected batch."}
            </p>
          </div>
          {selectedBatchId && (
            <GlassButton
              variant="secondary"
              size="md"
              className="self-start sm:self-auto"
              onClick={() => navigate({ view: "batch", batchId: selectedBatchId, batchName: selectedBatch?.name, tab: "today" })}
            >
              View all classes <ChevronRight size={16} />
            </GlassButton>
          )}
        </header>

        {/* Batch selector */}
        {enrolledBatches.length > 0 && (
          <label className="block w-full max-w-full sm:max-w-md">
            <span className="mb-2 block text-sm font-semibold text-foreground">Choose a batch</span>
            <select
              value={selectedBatchId}
              onChange={(event) => setSelectedBatchId(event.target.value)}
              className="h-12 w-full appearance-none rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm outline-none transition-colors duration-200 hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              {enrolledBatches.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}
            </select>
          </label>
        )}

        {/* Continue watching */}
        <ContinueWatching />

        {/* Class list */}
        <section className="space-y-4">
          {loadingBatches || loadingLive ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <GlassSkeleton key={i} className="h-28" />)}
            </div>
          ) : liveClasses.length === 0 ? (
            <EmptyState
              icon={<Radio size={22} />}
              title={enrolledBatches.length === 0 ? "No enrolled batches yet" : "No classes scheduled today"}
              hint={enrolledBatches.length === 0 ? "Enroll in a batch to see its classes here." : "Try another enrolled batch or check back later."}
            />
          ) : (
            <div className="sb-fade-up sb-scroll -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              {liveClasses.map((item) => <LivePreviewCard key={`${item.batchId}:${item.id}`} liveClass={item} onOpen={() => openLive(item)} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LivePreviewCard({ liveClass, onOpen }: { liveClass: LiveClass; onOpen: () => void }) {
  const isLive = liveClass.status === "live";
  const isEnded = liveClass.status === "ended";
  return (
    <GlassCard hover className="w-56 shrink-0 snap-start overflow-hidden rounded-2xl sm:w-64">
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full cursor-pointer flex-col text-left"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          <SafeImage
            src={liveClass.thumbnail}
            alt={liveClass.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-ink-950/20 transition-colors duration-200 group-hover:bg-ink-950/35">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-110">
              <Play size={16} className="ml-0.5" />
            </span>
          </span>
        </div>
        <div className="min-w-0 space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {isLive ? (
              <GlassBadge tone="danger"><Radio size={10} /> Live</GlassBadge>
            ) : isEnded ? (
              <GlassBadge tone="neutral">Ended</GlassBadge>
            ) : (
              <GlassBadge tone="warning"><Clock size={10} /> Upcoming</GlassBadge>
            )}
            <span className="truncate text-xs text-muted-foreground">{liveClass.batchName}</span>
          </div>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{liveClass.title}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays size={12} /> {fmtTime(liveClass.startTime)}
          </p>
        </div>
      </button>
    </GlassCard>
  );
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
