"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getEnrolledBatchIds } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import {
  GlassBadge,
  GlassCard,
  GlassSkeleton,
  SafeImage,
  EmptyState,
} from "./glass";
import {
  CalendarDays,
  Clock,
  Play,
  Radio,
  Timer,
  Flame,
  Target,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  CircleDot,
  Ban,
  PauseCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CatalogBatch {
  _id: string;
  name: string;
  byName: string;
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

function classStatus(start: string, end: string): "live" | "upcoming" | "ended" {
  const now = Date.now();
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (Number.isNaN(s)) return "upcoming";
  if (now < s) return "upcoming";
  if (Number.isNaN(e) || now <= e) return "live";
  return "ended";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseMetaStatus(raw: unknown): ClassMetaStatus {
  if (typeof raw !== "string") return "";
  const s = raw.toLowerCase().trim();
  if (s === "cancelled" || s === "canceled" || s === "cancel") return "cancelled";
  if (s === "postponed" || s === "reschedule" || s === "rescheduled" || s === "postpone") return "postponed";
  return "";
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function formatTimeShort(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function diffLabel(ms: number): string {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000) % 24;
  const d = Math.floor(total / 86400000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function urgencyColor(u: "far" | "near" | "imminent"): string {
  if (u === "imminent") return "bg-red-500/15 text-red-500 ring-1 ring-red-500/30";
  if (u === "near") return "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/25";
  return "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/25";
}

function urgencyFromMs(ms: number): "far" | "near" | "imminent" {
  const mins = ms / 60000;
  if (mins <= 5) return "imminent";
  if (mins <= 60) return "near";
  return "far";
}

export function PlannerView() {
  const { navigate } = useApp();
  const user = useAuth();
  const authLoading = user === undefined;
  const [enrolledBatches, setEnrolledBatches] = useState<CatalogBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [allClasses, setAllClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [catalogResponse, enrolledIds] = await Promise.all([
          fetch("/api/batches"),
          user ? getEnrolledBatchIds(user.uid) : Promise.resolve([] as string[]),
        ]);
        const data = (await catalogResponse.json()) as { success?: boolean; batches?: CatalogBatch[] };
        const catalog = data.success && Array.isArray(data.batches) ? data.batches : [];
        const enrolled = enrolledIds.map(
          (id) => catalog.find((batch) => batch._id === id) ?? { _id: id, name: "Enrolled batch", byName: "" },
        );
        if (!alive) return;
        setEnrolledBatches(enrolled);
        setSelectedBatchId((current) => enrolled.some((batch) => batch._id === current) ? current : enrolled[0]?._id ?? "");
      } catch {
        if (alive) { setEnrolledBatches([]); setSelectedBatchId(""); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user, authLoading]);

  useEffect(() => {
    let alive = true;
    const loadWeek = async () => {
      if (!selectedBatchId || enrolledBatches.length === 0) {
        setAllClasses([]); return;
      }
      setLoading(true);
      const batch = enrolledBatches.find((item) => item._id === selectedBatchId);
      try {
        const response = await fetch(`/api/batches/${selectedBatchId}/today`);
        const data = (await response.json()) as { classes?: Array<Record<string, unknown>> };
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
        if (alive) setAllClasses(classes);
      } catch {
        if (alive) setAllClasses([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void loadWeek();
    return () => { alive = false; };
  }, [enrolledBatches, selectedBatchId]);

  const currentWeekStart = startOfWeek(new Date(now));
  const weekStart = new Date(currentWeekStart);
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);

  const dayBuckets: LiveClass[][] = Array.from({ length: 7 }, () => []);
  for (const cls of allClasses) {
    const d = new Date(cls.startTime);
    if (!Number.isNaN(d.getTime())) {
      const dayIdx = d.getDay();
      dayBuckets[dayIdx].push(cls);
    }
  }
  for (const bucket of dayBuckets) {
    bucket.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  const todayIdx = new Date(now).getDay();
  const isCurrentWeek = weekOffset === 0;
  const isPastWeek = weekOffset < 0;

  const liveCount = allClasses.filter((c) => c.status === "live").length;
  const upcomingCount = allClasses.filter((c) => c.status === "upcoming").length;
  const completedCount = allClasses.filter((c) => c.status === "ended").length;
  const totalThisWeek = allClasses.length;
  const studyProgress = totalThisWeek > 0 ? Math.round((completedCount / totalThisWeek) * 100) : 0;

  const { toast } = useToast();

  const openPlayer = (cls: LiveClass) => {
    if (cls.metaStatus === "cancelled") {
      toast({
        title: "Class cancelled",
        description: `"${cls.title}" has been cancelled by the educator.`,
        variant: "destructive",
      });
      return;
    }
    if (cls.metaStatus === "postponed") {
      toast({
        title: "Class postponed",
        description: `"${cls.title}" has been postponed. Check back for the new schedule.`,
      });
      return;
    }
    if (cls.status === "upcoming") {
      toast({
        title: "Class not started",
        description: `"${cls.title}" hasn't started yet. Check the countdown for the start time.`,
      });
      return;
    }
    if (cls.videoId && cls.subjectSlug) {
      navigate({ view: "watch", batchId: cls.batchId, subjectSlug: cls.subjectSlug, subjectName: cls.subject, batchName: cls.batchName, contentId: cls.id, lectureTitle: cls.title, videoId: cls.videoId });
    } else {
      navigate({ view: "batch", batchId: cls.batchId, batchName: cls.batchName, tab: "today" });
    }
  };

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <main className="w-full min-w-0 flex-1 text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Header */}
        <header className="sb-fade-up relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-surface to-accent-soft/20 p-6 sm:p-8">
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-primary" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Study planner</p>
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Weekly Schedule
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                Plan your week, track progress, and never miss a class.
              </p>
            </div>
            {/* Progress ring */}
            {totalThisWeek > 0 && (
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface/60 px-5 py-4 backdrop-blur-sm">
                <ProgressRing percent={studyProgress} />
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-foreground">{completedCount}/{totalThisWeek} done</p>
                  <p className="text-xs text-muted-foreground">{studyProgress}% complete</p>
                </div>
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Radio size={18} />} label="Live now" value={liveCount} tone="danger" />
          <StatCard icon={<Clock size={18} />} label="Upcoming" value={upcomingCount} tone="warning" />
          <StatCard icon={<Flame size={18} />} label="Completed" value={completedCount} tone="success" />
          <StatCard icon={<TrendingUp size={18} />} label="Total" value={totalThisWeek} tone="primary" />
        </div>

        {/* Batch pills + week navigation */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {enrolledBatches.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              {enrolledBatches.map((batch) => (
                <button
                  key={batch._id}
                  type="button"
                  onClick={() => setSelectedBatchId(batch._id)}
                  className={cn(
                    "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                    selectedBatchId === batch._id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {batch.name}
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}

          {/* Week nav */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-2 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Previous week"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-[140px] text-center">
              <p className="text-xs font-semibold text-foreground">
                {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" – "}
                {weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isCurrentWeek ? "This week" : isPastWeek ? "Past week" : "Future week"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Next week"
            >
              <ChevronRight size={18} />
            </button>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="ml-1 cursor-pointer rounded-lg bg-accent-soft px-2.5 py-1 text-[10px] font-bold text-primary transition-colors hover:brightness-95"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <GlassSkeleton key={i} className="h-24" />)}
          </div>
        ) : allClasses.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={enrolledBatches.length === 0 ? "No enrolled batches yet" : "No classes found"}
            hint={enrolledBatches.length === 0 ? "Enroll in a batch to plan your week." : "Try another batch or week."}
          />
        ) : (
          <div className="space-y-4">
            {/* Week day strip */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {dayBuckets.map((bucket, dayIdx) => {
                const dayDate = new Date(weekStart);
                dayDate.setDate(weekStart.getDate() + dayIdx);
                const isToday = isCurrentWeek && dayIdx === todayIdx;
                const hasClasses = bucket.length > 0;
                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition-all sm:px-2 sm:py-3",
                      isToday
                        ? "border-primary/50 bg-accent-soft/30 shadow-sm"
                        : hasClasses
                          ? "border-border bg-surface"
                          : "border-border/60 bg-surface/30",
                    )}
                  >
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wide sm:text-xs",
                      isToday ? "text-primary" : "text-muted-foreground",
                    )}>
                      {DAY_NAMES[dayIdx]}
                    </span>
                    <span className={cn(
                      "text-sm font-bold tabular-nums sm:text-base",
                      isToday ? "text-primary" : "text-foreground",
                    )}>
                      {dayDate.getDate()}
                    </span>
                    {hasClasses ? (
                      <span className={cn(
                        "flex h-1.5 w-1.5 rounded-full",
                        bucket.some((c) => c.status === "live") ? "bg-red-500" : "bg-primary/60",
                      )} />
                    ) : (
                      <span className="h-1.5 w-1.5" />
                    )}
                    {hasClasses && (
                      <span className="text-[9px] font-semibold text-muted-foreground sm:text-[10px]">
                        {bucket.length}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Day sections */}
            <div className="space-y-4">
              {dayBuckets.map((bucket, dayIdx) => {
                const dayDate = new Date(weekStart);
                dayDate.setDate(weekStart.getDate() + dayIdx);
                const isToday = isCurrentWeek && dayIdx === todayIdx;

                if (bucket.length === 0) return null;

                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "rounded-2xl border overflow-hidden",
                      isToday ? "border-primary/40 shadow-md" : "border-border",
                    )}
                  >
                    {/* Day header */}
                    <div className={cn(
                      "flex items-center gap-3 px-5 py-3 border-b",
                      isToday ? "border-primary/20 bg-accent-soft/30" : "border-border bg-surface/60",
                    )}>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-sm font-bold text-foreground shadow-sm">
                        {dayDate.getDate()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground">
                          {DAY_NAMES_FULL[dayIdx]}
                          {isToday && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                              <CircleDot size={9} /> Today
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {dayDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                          {" · "}
                          {bucket.length} class{bucket.length > 1 ? "es" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Class rows */}
                    <div className="divide-y divide-border">
                      {bucket.map((cls) => {
                        const startMs = new Date(cls.startTime).getTime();
                        const remaining = cls.status === "upcoming" && startMs > now ? startMs - now : 0;
                        const isCancelled = cls.metaStatus === "cancelled";
                        const isPostponed = cls.metaStatus === "postponed";
                        const isDimmed = isCancelled || isPostponed;
                        const clickable = cls.metaStatus === "" && cls.status !== "upcoming";
                        return (
                          <button
                            key={`${cls.batchId}:${cls.id}`}
                            type="button"
                            onClick={() => openPlayer(cls)}
                            className={cn(
                              "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:gap-5 sm:px-5 sm:py-4",
                              clickable ? "cursor-pointer hover:bg-muted" : "cursor-default",
                              isDimmed && "opacity-50",
                            )}
                          >
                            {/* Time */}
                            <div className="flex w-16 shrink-0 flex-col items-start sm:w-20">
                              <span className={cn("text-sm font-bold tabular-nums", isDimmed ? "text-muted-foreground" : "text-foreground")}>
                                {formatTimeShort(cls.startTime)}
                              </span>
                              {cls.endTime && (
                                <span className="text-[10px] tabular-nums text-muted-foreground">
                                  {formatTimeShort(cls.endTime)}
                                </span>
                              )}
                            </div>

                            {/* Timeline dot + line */}
                            <div className="relative hidden shrink-0 flex-col items-center self-stretch sm:flex">
                              <span className={cn(
                                "mt-1 h-2.5 w-2.5 rounded-full ring-2",
                                isCancelled ? "bg-red-600 ring-red-600/20" :
                                isPostponed ? "bg-amber-600 ring-amber-600/20" :
                                cls.status === "live" ? "bg-red-500 ring-red-500/20" :
                                cls.status === "ended" ? "bg-emerald-500 ring-emerald-500/20" :
                                "bg-amber-500 ring-amber-500/20",
                              )} />
                              <span className="mt-1 w-px flex-1 bg-border" />
                            </div>

                            {/* Thumbnail */}
                            <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-14 sm:w-24">
                              <SafeImage
                                src={cls.thumbnail}
                                alt={cls.title}
                                className={cn("h-full w-full object-cover transition-transform duration-300", clickable && "group-hover:scale-105")}
                              />
                              {clickable && (
                                <span className="absolute inset-0 flex items-center justify-center bg-ink-950/40 transition-colors group-hover:bg-ink-950/55">
                                  <Play size={14} className="text-white" />
                                </span>
                              )}
                              {cls.status === "live" && !isDimmed && (
                                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-red-500 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                                  <Radio size={7} /> Live
                                </span>
                              )}
                              {isCancelled && (
                                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                                  <Ban size={7} /> Off
                                </span>
                              )}
                              {isPostponed && (
                                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-amber-600 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
                                  <PauseCircle size={7} /> Delayed
                                </span>
                              )}
                            </div>

                            {/* Title */}
                            <div className="min-w-0 flex-1">
                              <p className={cn(
                                "line-clamp-1 text-sm font-semibold",
                                isDimmed ? "text-muted-foreground line-through" : cls.status === "ended" ? "text-muted-foreground" : "text-foreground",
                              )}>
                                {cls.title}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2">
                                {cls.subject && (
                                  <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                    <BookOpen size={10} /> {cls.subject}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Status + countdown */}
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              {isCancelled ? (
                                <GlassBadge tone="danger"><Ban size={9} /> Cancelled</GlassBadge>
                              ) : isPostponed ? (
                                <GlassBadge tone="warning"><PauseCircle size={9} /> Postponed</GlassBadge>
                              ) : cls.status === "live" ? (
                                <GlassBadge tone="danger"><Radio size={9} /> Live</GlassBadge>
                              ) : cls.status === "ended" ? (
                                <GlassBadge tone="success"><Flame size={9} /> Done</GlassBadge>
                              ) : (
                                <GlassBadge tone="warning"><Clock size={9} /> Soon</GlassBadge>
                              )}
                              {remaining > 0 && !isDimmed && (
                                <div className={cn(
                                  "hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:flex",
                                  urgencyColor(urgencyFromMs(remaining)),
                                )}>
                                  <Timer size={9} className={urgencyFromMs(remaining) === "imminent" ? "animate-pulse" : ""} />
                                  {diffLabel(remaining)}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode; label: string; value: number;
  tone: "danger" | "warning" | "success" | "primary";
}) {
  const toneClasses = {
    danger: "bg-red-500/12 text-red-600 dark:text-red-400",
    warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    primary: "bg-accent-soft text-primary",
  };
  return (
    <GlassCard hover={false} className="flex items-center gap-3 p-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneClasses[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </GlassCard>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-border" />
        <circle
          cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-primary transition-all duration-500"
        />
      </svg>
      <span className="absolute text-sm font-bold text-foreground">{percent}%</span>
    </div>
  );
}
