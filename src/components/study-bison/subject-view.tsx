"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import {
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassSkeleton,
  EmptyState,
  SectionHeading,
} from "./glass";
import {
  ArrowLeft,
  ChevronRight,
  Search,
  Layers,
  FileText,
  PlayCircle,
  Home,
} from "lucide-react";

interface Topic {
  id: string;
  name: string;
  videos: number;
  notes: number;
  exercises: number;
}

export function SubjectView({
  batchId,
  subjectSlug,
}: {
  batchId: string;
  subjectSlug: string;
}) {
  const { navigate, back } = useApp();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [subjectName, setSubjectName] = useState<string>("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/batches/${batchId}/subjects/${encodeURIComponent(subjectSlug)}/topics`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setTopics(d?.topics ?? []);
        setSubjectName(prettifySlug(subjectSlug));
      })
      .catch(() => alive && setTopics([]));
    return () => {
      alive = false;
    };
  }, [batchId, subjectSlug]);

  const shownName = useApp((s) => s.subjectName) || subjectName || prettifySlug(subjectSlug);

  const filtered = useMemo(() => {
    if (!topics) return [];
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(q));
  }, [topics, query]);

  const totals = useMemo(() => {
    if (!topics) return { lectures: 0, notes: 0 };
    return {
      lectures: topics.reduce((a, t) => a + t.videos, 0),
      notes: topics.reduce((a, t) => a + t.notes, 0),
    };
  }, [topics]);

  return (
    <main className="w-full flex-1 px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center gap-3 pt-6 sm:pt-10">
          <GlassButton variant="secondary" size="sm" onClick={back}>
            <ArrowLeft size={14} /> Back
          </GlassButton>
          <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <button className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground" onClick={() => navigate({ view: "home" })}>
              <Home size={12} /> Home
            </button>
            <ChevronRight size={12} />
            <button
              className="line-clamp-1 max-w-[180px] cursor-pointer transition-colors hover:text-foreground"
              onClick={() => navigate({ view: "batch", batchId })}
            >
              {useApp.getState().batchName ?? "Batch"}
            </button>
            <ChevronRight size={12} />
            <span className="line-clamp-1 max-w-[240px] text-foreground">{shownName}</span>
          </nav>
        </div>

        <GlassCard hover={false} className="sb-fade-up p-6 sm:p-8">
          <GlassBadge tone="primary" className="mb-4">
            <Layers size={11} /> Subject
          </GlassBadge>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{shownName}</h1>
              {topics && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {topics.length} chapters · {totals.lectures} lectures · {totals.notes} notes
                </p>
              )}
            </div>
            <label className="flex w-full items-center gap-2 rounded-full border border-border bg-muted px-4 transition-colors focus-within:border-primary sm:w-80">
              <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chapters (e.g. Kinematics)"
                className="h-10 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                aria-label="Search chapters"
              />
            </label>
          </div>
        </GlassCard>

        <section aria-label="Chapters">
          {topics === null ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => <GlassSkeleton key={i} className="h-28" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={22} />}
              title="No chapters found"
              hint={query ? "Try another keyword." : "This subject has no chapters published yet."}
            />
          ) : (
            <div className="sb-fade-up grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t, i) => (
                <button
                  key={t.id}
                  className="group relative w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() =>
                    navigate({
                      view: "topic",
                      batchId,
                      subjectSlug,
                      topicId: t.id,
                      topicName: t.name,
                    })
                  }
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-bold text-accent-soft-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{t.name}</h3>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <GlassBadge tone={t.videos > 0 ? "primary" : "neutral"}>
                          <PlayCircle size={11} /> {t.videos} Lectures
                        </GlassBadge>
                        <GlassBadge tone={t.notes > 0 ? "success" : "neutral"}>
                          <FileText size={11} /> {t.notes} Notes
                        </GlassBadge>
                        {t.exercises > 0 && <GlassBadge tone="warning">{t.exercises} DPP</GlassBadge>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <SectionHeading className="pt-4" title="" />
      </div>
    </main>
  );
}

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
