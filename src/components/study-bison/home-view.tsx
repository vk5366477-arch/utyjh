"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getEnrolledBatchIds } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage, EmptyState } from "./glass";
import { ContinueWatching } from "./continue-watching";
import { TelegramJoinButton } from "./telegram-popup";
import {
  Radio,
  ChevronRight,
  Play,
  Clock,
  CalendarDays,
  Timer,
  CalendarRange,
  Sparkles,
  Ban,
  PauseCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

type ClassMetaStatus = "cancelled" | "postponed" | "";

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
  metaStatus: ClassMetaStatus;
}

function parseMetaStatus(raw: unknown): ClassMetaStatus {
  if (typeof raw !== "string") return "";
  const s = raw.toLowerCase().trim();
  if (s === "cancelled" || s === "canceled" || s === "cancel") return "cancelled";
  if (s === "postponed" || s === "reschedule" || s === "rescheduled" || s === "postpone") return "postponed";
  return "";
}

function isClassClickable(c: LiveClass): boolean {
  return c.metaStatus === "" && c.status !== "upcoming";
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
          _id: id, name: "Enrolled batch", byName: "",
        });
        if (!alive) return;
        setEnrolledBatches(enrolled);
        setSelectedBatchId((current) => enrolled.some((batch) => batch._id === current) ? current : enrolled[0]?._id ?? "");
      } catch {
        if (alive) { setEnrolledBatches([]); setSelectedBatchId(""); }
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
        setLiveClasses([]); setLoadingLive(false); return;
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
          metaStatus: parseMetaStatus(item.apiStatus),
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
    return () => { alive = false; };
  }, [enrolledBatches, selectedBatchId]);

  const liveCount = liveClasses.filter((c) => c.status === "live").length;
  const upcomingCount = liveClasses.filter((c) => c.status === "upcoming").length;

  const { toast } = useToast();

  const openLive = (c: LiveClass) => {
    if (c.metaStatus === "cancelled") {
      toast({
        title: "Class cancelled",
        description: `\"${c.title}\" has been cancelled by the educator.`,
        variant: "destructive",
      });
      return;
    }
    if (c.metaStatus === "postponed") {
      toast({
        title: "Class postponed",
        description: `\"${c.title}\" has been postponed. Check back for the new schedule.`,
      });
      return;
    }
    if (c.status === "upcoming") {
      toast({
        title: "Class not started",
        description: `\"${c.title}\" hasn't started yet. Check the countdown for the start time.`,
      });
      return;
    }
    if (!c.id || !c.subjectSlug) {
      navigate({ view: "batch", batchId: c.batchId, batchName: c.batchName });
      return;
    }
    if (c.videoId) {
      navigate({ view: "watch", batchId: c.batchId, subjectSlug: c.subjectSlug, subjectName: c.subject, batchName: c.batchName, contentId: c.id, lectureTitle: c.title, videoId: c.videoId });
      return;
    }
    navigate({ view: "batch", batchId: c.batchId, batchName: c.batchName, tab: "today" });
  };

  const selectedBatch = enrolledBatches.find((batch) => batch._id === selectedBatchId);
  const liveClassesList = liveClasses.filter((c) => c.status === "live");
  const upcomingList = liveClasses.filter((c) => c.status === "upcoming");
  const endedList = liveClasses.filter((c) => c.status === "ended");

  return (
    <main className="w-full min-w-0 flex-1 text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Hero header */}
        <header className="sb-fade-up relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-surface to-accent-soft/20 p-6 sm:p-8">
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-2.5 w-2.5 rounded-full",
                    liveCount > 0 ? "animate-pulse bg-destructive" : "bg-muted-foreground/40"
                  )}
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {liveCount > 0 ? `${liveCount} live now` : "Learning dashboard"}
                </p>
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Today&apos;s Classes
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                {liveCount > 0
                  ? `${liveCount} class${liveCount > 1 ? "es" : ""} streaming now, ${upcomingCount} upcoming.`
                  : "All your scheduled classes for the selected batch in one place."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TelegramJoinButton />
              {selectedBatchId && (
                <GlassButton variant="secondary" size="md" onClick={() => navigate({ view: "planner" })}>
                  <CalendarRange size={16} /> Planner
                </GlassButton>
              )}
              {selectedBatchId && (
                <GlassButton variant="primary" size="md" onClick={() => navigate({ view: "batch", batchId: selectedBatchId, batchName: selectedBatch?.name, tab: "today" })}>
                  View all <ChevronRight size={16} />
                </GlassButton>
              )}
            </div>
          </div>
          {/* Decorative glow */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        </header>

        {/* Batch selector — pill style */}
        {enrolledBatches.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {enrolledBatches.map((batch) => (
              <button
                key={batch._id}
                type="button"
                onClick={() => setSelectedBatchId(batch._id)}
                className={cn(
                  "cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200",
                  selectedBatchId === batch._id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {batch.name}
              </button>
            ))}
          </div>
        )}

        {/* Continue watching */}
        <ContinueWatching />

        {/* Class sections */}
        {loadingBatches || loadingLive ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <GlassSkeleton key={i} className="h-32" />)}
          </div>
        ) : liveClasses.length === 0 ? (
          <EmptyState
            icon={<Radio size={22} />}
            title={enrolledBatches.length === 0 ? "No enrolled batches yet" : "No classes scheduled today"}
            hint={enrolledBatches.length === 0 ? "Enroll in a batch to see its classes here." : "Try another enrolled batch or check the weekly planner."}
          />
        ) : (
          <div className="space-y-10">
            {/* Live now */}
            {liveClassesList.length > 0 && (
              <ClassSection
                label="Live now"
                icon={<Radio size={16} className="text-destructive" />}
                accent="destructive"
                classes={liveClassesList}
                onOpen={openLive}
              />
            )}

            {/* Upcoming */}
            {upcomingList.length > 0 && (
              <ClassSection
                label="Upcoming today"
                icon={<Clock size={16} className="text-amber-500" />}
                accent="warning"
                classes={upcomingList}
                onOpen={openLive}
              />
            )}

            {/* Completed */}
            {endedList.length > 0 && (
              <ClassSection
                label="Completed"
                icon={<Sparkles size={16} className="text-muted-foreground" />}
                accent="neutral"
                classes={endedList}
                onOpen={openLive}
                collapsed
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function ClassSection({
  label,
  icon,
  accent,
  classes,
  onOpen,
  collapsed = false,
}: {
  label: string;
  icon: React.ReactNode;
  accent: "destructive" | "warning" | "neutral";
  classes: LiveClass[];
  onOpen: (c: LiveClass) => void;
  collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsed);

  const accentLine = {
    destructive: "bg-destructive",
    warning: "bg-amber-500",
    neutral: "bg-muted-foreground/40",
  }[accent];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={cn("h-5 w-1 rounded-full", accentLine)} />
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {icon}
          {label}
        </h2>
        <span className="text-xs font-semibold text-muted-foreground">{classes.length}</span>
        {collapsed && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto cursor-pointer text-xs font-semibold text-primary hover:underline"
          >
            {expanded ? "Hide" : `Show ${classes.length}`}
          </button>
        )}
      </div>
      {expanded && (
        <div className="sb-fade-up grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
          {classes.map((item) => (
            <LivePreviewCard key={`${item.batchId}:${item.id}`} liveClass={item} onOpen={() => onOpen(item)} />
          ))}
        </div>
      )}
    </section>
  );
}

type CountdownParts = {
  d: number; h: number; m: number; s: number; label: string;
  urgency: "far" | "near" | "imminent" | "live";
};

function diffToParts(ms: number): CountdownParts {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000) % 24;
  const d = Math.floor(total / 86400000);
  const minutesTotal = total / 60000;
  let urgency: CountdownParts["urgency"] = "far";
  if (minutesTotal <= 5) urgency = "imminent";
  else if (minutesTotal <= 60) urgency = "near";
  const label =
    d > 0 ? `${d}d ${h}h ${m}m`
    : h > 0 ? `${h}h ${m}m ${s}s`
    : m > 0 ? `${m}m ${s}s`
    : `${s}s`;
  return { d, h, m, s, label, urgency };
}

function urgencyClasses(u: CountdownParts["urgency"]): string {
  switch (u) {
    case "imminent": return "bg-red-500/15 text-red-500 ring-1 ring-red-500/30";
    case "near": return "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/25";
    case "far":
    default: return "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/25";
  }
}

function LivePreviewCard({ liveClass, onOpen }: { liveClass: LiveClass; onOpen: () => void }) {
  const isLive = liveClass.status === "live";
  const isEnded = liveClass.status === "ended";
  const isUpcoming = liveClass.status === "upcoming";
  const isCancelled = liveClass.metaStatus === "cancelled";
  const isPostponed = liveClass.metaStatus === "postponed";
  const isDimmed = isCancelled || isPostponed;
  const clickable = isClassClickable(liveClass);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isUpcoming || isDimmed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isUpcoming, isDimmed]);

  const startMs = new Date(liveClass.startTime).getTime();
  const remaining = isUpcoming && !Number.isNaN(startMs) && startMs > now ? startMs - now : 0;
  const cd = remaining > 0 ? diffToParts(remaining) : null;

  return (
    <GlassCard hover={clickable} className={cn("group flex flex-col overflow-hidden rounded-2xl", isDimmed && "opacity-60")}>
      <button type="button" onClick={onOpen} className={cn("flex w-full flex-col text-left", clickable ? "cursor-pointer" : "cursor-default")}>
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <SafeImage
            src={liveClass.thumbnail}
            alt={liveClass.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 via-transparent to-transparent" />
          {isCancelled && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
              <Ban size={9} /> Cancelled
            </span>
          )}
          {isPostponed && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
              <PauseCircle size={9} /> Postponed
            </span>
          )}
          {isLive && !isDimmed && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg shadow-red-500/30">
              <Radio size={9} className="animate-pulse" /> Live
            </span>
          )}
          {isEnded && !isDimmed && (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-ink-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80 backdrop-blur-sm">
              Replay
            </span>
          )}
          {/* Play button — hidden for cancelled/postponed */}
          {!isDimmed && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md shadow-lg transition-all duration-200 group-hover:scale-110 group-hover:bg-white/25">
                <Play size={16} className="ml-0.5" />
              </span>
            </span>
          )}
          {/* Time badge */}
          <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-lg bg-ink-950/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
            <CalendarDays size={10} /> {fmtTime(liveClass.startTime)}
          </span>
        </div>
        <div className="min-w-0 space-y-2 p-3.5">
          <div className="flex items-center gap-2">
            {isCancelled ? (
              <GlassBadge tone="danger"><Ban size={9} /> Cancelled</GlassBadge>
            ) : isPostponed ? (
              <GlassBadge tone="warning"><PauseCircle size={9} /> Postponed</GlassBadge>
            ) : isLive ? (
              <GlassBadge tone="danger"><Radio size={9} /> Live</GlassBadge>
            ) : isEnded ? (
              <GlassBadge tone="neutral">Ended</GlassBadge>
            ) : (
              <GlassBadge tone="warning"><Clock size={9} /> Upcoming</GlassBadge>
            )}
            {liveClass.subject && (
              <span className="truncate text-[11px] font-medium text-muted-foreground">{liveClass.subject}</span>
            )}
          </div>
          <p className={cn("line-clamp-2 text-sm font-semibold leading-snug", isDimmed ? "text-muted-foreground line-through" : "text-foreground")}>{liveClass.title}</p>
          {cd && !isDimmed && (
            <div className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold", urgencyClasses(cd.urgency))}>
              <Timer size={11} className={cd.urgency === "imminent" ? "animate-pulse" : ""} />
              <span>Starts in {cd.label}</span>
            </div>
          )}
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
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
