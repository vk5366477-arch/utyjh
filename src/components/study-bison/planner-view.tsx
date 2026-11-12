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
import { InlinePlayerModal, useInlineStream } from "./inline-player-modal";
import type { StreamResolution } from "./native-player";
import {
  CalendarDays,
  Clock,
  Play,
  Radio,
  Timer,
  Flame,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CatalogBatch {
  _id: string;
  name: string;
  byName: string;
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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
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
  const [playerClass, setPlayerClass] = useState<LiveClass | null>(null);

  const { stream, resolving } = useInlineStream(playerClass);

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
          (id) =>
            catalog.find((batch) => batch._id === id) ?? {
              _id: id,
              name: "Enrolled batch",
              byName: "",
            },
        );
        if (!alive) return;
        setEnrolledBatches(enrolled);
        setSelectedBatchId((current) =>
          enrolled.some((batch) => batch._id === current) ? current : enrolled[0]?._id ?? "",
        );
      } catch {
        if (alive) {
          setEnrolledBatches([]);
          setSelectedBatchId("");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, authLoading]);

  useEffect(() => {
    let alive = true;
    const loadWeek = async () => {
      if (!selectedBatchId || enrolledBatches.length === 0) {
        setAllClasses([]);
        return;
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
          subjectSlug:
            typeof item.subjectSlug === "string"
              ? item.subjectSlug
              : typeof item.subjectId === "string"
                ? item.subjectId
                : typeof item.batchSubjectId === "string"
                  ? item.batchSubjectId
                  : "",
          subjectId:
            typeof item.subjectId === "string"
              ? item.subjectId
              : typeof item.batchSubjectId === "string"
                ? item.batchSubjectId
                : "",
          status: classStatus(
            typeof item.startTime === "string" ? item.startTime : "",
            typeof item.endTime === "string" ? item.endTime : "",
          ),
        }));
        if (alive) setAllClasses(classes);
      } catch {
        if (alive) setAllClasses([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void loadWeek();
    return () => {
      alive = false;
    };
  }, [enrolledBatches, selectedBatchId]);

  // Group classes by day of week
  const weekStart = startOfWeek(new Date(now));
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
  const liveCount = allClasses.filter((c) => c.status === "live").length;
  const upcomingCount = allClasses.filter((c) => c.status === "upcoming").length;
  const completedCount = allClasses.filter((c) => c.status === "ended").length;

  const openPlayer = (cls: LiveClass) => {
    if (cls.status === "upcoming") return;
    setPlayerClass(cls);
  };

  return (
    <main className="w-full min-w-0 flex-1 text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Header */}
        <header className="sb-fade-up space-y-2 border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Study planner
          </p>
          <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <Target size={26} className="text-primary" />
            Weekly Schedule
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your full week at a glance. Tap any class to watch it instantly.
          </p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Radio size={18} />}
            label="Live now"
            value={liveCount}
            tone="danger"
          />
          <StatCard
            icon={<Clock size={18} />}
            label="Upcoming"
            value={upcomingCount}
            tone="warning"
          />
          <StatCard
            icon={<Flame size={18} />}
            label="Completed"
            value={completedCount}
            tone="success"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="Total this week"
            value={allClasses.length}
            tone="primary"
          />
        </div>

        {/* Batch selector */}
        {enrolledBatches.length > 0 && (
          <label className="block w-full max-w-md">
            <span className="mb-2 block text-sm font-semibold text-foreground">Choose a batch</span>
            <select
              value={selectedBatchId}
              onChange={(event) => setSelectedBatchId(event.target.value)}
              className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm outline-none transition-colors duration-200 hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              {enrolledBatches.map((batch) => (
                <option key={batch._id} value={batch._id}>
                  {batch.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Loading */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassSkeleton key={i} className="h-24" />
            ))}
          </div>
        ) : allClasses.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={enrolledBatches.length === 0 ? "No enrolled batches yet" : "No classes this week"}
            hint={
              enrolledBatches.length === 0
                ? "Enroll in a batch to plan your week."
                : "Check back later or try another batch."
            }
          />
        ) : (
          <div className="space-y-5">
            {dayBuckets.map((bucket, dayIdx) => {
              const dayDate = new Date(weekStart);
              dayDate.setDate(weekStart.getDate() + dayIdx);
              const isToday = dayIdx === todayIdx;

              if (bucket.length === 0) {
                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "flex items-center gap-4 rounded-xl border px-5 py-4",
                      isToday ? "border-primary/30 bg-accent-soft/30" : "border-border bg-surface/50",
                    )}
                  >
                    <div className="flex w-28 shrink-0 flex-col">
                      <span className="text-sm font-bold text-foreground">
                        {DAY_NAMES[dayIdx]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">No classes scheduled</span>
                  </div>
                );
              }

              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "rounded-xl border overflow-hidden",
                    isToday ? "border-primary/40 shadow-md" : "border-border",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 border-b",
                      isToday ? "border-primary/20 bg-accent-soft/40" : "border-border bg-surface/60",
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">
                        {DAY_NAMES[dayIdx]}
                        {isToday && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                            Today
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        <span className="mx-1.5">·</span>
                        {bucket.length} class{bucket.length > 1 ? "es" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {bucket.map((cls) => {
                      const startMs = new Date(cls.startTime).getTime();
                      const remaining =
                        cls.status === "upcoming" && startMs > now ? startMs - now : 0;
                      return (
                        <button
                          key={`${cls.batchId}:${cls.id}`}
                          type="button"
                          onClick={() => openPlayer(cls)}
                          disabled={cls.status === "upcoming"}
                          className={cn(
                            "group flex w-full items-center gap-4 px-5 py-3 text-left transition-colors",
                            cls.status === "upcoming"
                              ? "cursor-default"
                              : "cursor-pointer hover:bg-muted",
                          )}
                        >
                          {/* Time column */}
                          <div className="flex w-20 shrink-0 flex-col items-start">
                            <span className="text-sm font-bold tabular-nums text-foreground">
                              {formatTimeShort(cls.startTime)}
                            </span>
                            {cls.endTime && (
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                to {formatTimeShort(cls.endTime)}
                              </span>
                            )}
                          </div>

                          {/* Thumbnail */}
                          <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                            <SafeImage
                              src={cls.thumbnail}
                              alt={cls.title}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            {cls.status !== "upcoming" && (
                              <span className="absolute inset-0 flex items-center justify-center bg-ink-950/30 transition-colors group-hover:bg-ink-950/45">
                                <Play size={14} className="text-white" />
                              </span>
                            )}
                          </div>

                          {/* Title + status */}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-semibold text-foreground">
                              {cls.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{cls.subject}</p>
                          </div>

                          {/* Status badge */}
                          <div className="shrink-0">
                            {cls.status === "live" ? (
                              <GlassBadge tone="danger">
                                <Radio size={10} /> Live
                              </GlassBadge>
                            ) : cls.status === "ended" ? (
                              <GlassBadge tone="neutral">Ended</GlassBadge>
                            ) : (
                              <GlassBadge tone="warning">
                                <Clock size={10} /> Soon
                              </GlassBadge>
                            )}
                          </div>

                          {/* Countdown */}
                          {remaining > 0 && (
                            <div
                              className={cn(
                                "hidden shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold sm:flex",
                                urgencyColor(urgencyFromMs(remaining)),
                              )}
                            >
                              <Timer size={11} className={urgencyFromMs(remaining) === "imminent" ? "animate-pulse" : ""} />
                              {diffLabel(remaining)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <InlinePlayerModal
        open={!!playerClass}
        onClose={() => setPlayerClass(null)}
        stream={stream}
        resolving={resolving}
        title={playerClass?.title ?? ""}
      />
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
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
