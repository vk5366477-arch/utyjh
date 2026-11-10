"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Clock, Crown, FileText, RefreshCw, Search, Trophy } from "lucide-react";
import { getLeaderboard } from "@/lib/firebase";
import { useApp } from "@/lib/store";
import { GlassButton, GlassCard, SafeImage } from "./glass";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  rank: number;
  legacy: boolean;
  points: number;
  id: string;
  displayName?: string;
  photoURL?: string;
  lectureMinutesWatched: number;
  pdfsOpened: number;
  hasMinutes: boolean;
  hasPdfs: boolean;
}

const PAGE_SIZE = 15;
const num = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const score = (e: LeaderboardEntry) => (e.legacy ? e.points : e.lectureMinutesWatched);
const hasScore = (e: LeaderboardEntry) => e.legacy || e.hasMinutes;
const unit = (legacy: boolean) => (legacy ? "points" : "min");

function duration(minutes: number) {
  if (minutes < 60) return `${num.format(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${num.format(h)}h ${m}m` : `${num.format(h)}h`;
}

const MEDAL = {
  1: { label: "Champion", text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500", ring: "ring-amber-400/60", plinth: "bg-amber-500/10 border-amber-500/30", height: "min-h-60" },
  2: { label: "Runner-up", text: "text-ink-600 dark:text-ink-200", bar: "bg-ink-400", ring: "ring-ink-300/60", plinth: "bg-ink-400/10 border-ink-400/30", height: "min-h-44" },
  3: { label: "Third place", text: "text-orange-700 dark:text-orange-300", bar: "bg-orange-500", ring: "ring-orange-400/60", plinth: "bg-orange-500/10 border-orange-500/30", height: "min-h-36" },
} as const;

/* ---------- motion helpers ---------- */

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(target: number, delay = 0, ms = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); return; }
    let raf = 0;
    let start = 0;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min((t - start) / ms, 1);
        setValue(target * (1 - Math.pow(1 - p, 4)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, delay, ms]);
  return value;
}

function CountUp({ value, format, delay }: { value: number; format: (n: number) => string; delay?: number }) {
  const v = useCountUp(value, delay);
  return <>{format(v)}</>;
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([hit]) => {
      if (hit.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/* ---------- pieces ---------- */

function Avatar({ entry, size }: { entry: LeaderboardEntry; size: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-bold text-foreground",
        size === "lg" ? "h-16 w-16 text-xl sm:h-20 sm:w-20" : "h-10 w-10 text-sm"
      )}
    >
      {entry.photoURL ? (
        <SafeImage src={entry.photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        (entry.displayName?.trim().slice(0, 1) || "L").toUpperCase()
      )}
    </span>
  );
}

function PodiumColumn({ entry, top, order }: { entry: LeaderboardEntry; top: number; order: number }) {
  const name = entry.displayName || "Learner";
  const medal = MEDAL[entry.rank as 1 | 2 | 3] ?? MEDAL[3];
  const delay = 250 + order * 160;
  return (
    <article
      className="flex min-w-0 flex-1 flex-col items-center sb-fade-up"
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
      aria-label={`Rank ${entry.rank}: ${name}`}
    >
      <div className={cn("flex flex-col items-center rounded-full p-1 ring-4", medal.ring)}>
        {entry.rank === 1 && <Crown size={22} className="mb-1 text-amber-500" aria-hidden="true" />}
        <Avatar entry={entry} size="lg" />
      </div>
      <p className="mt-3 w-full truncate text-center text-sm font-semibold text-foreground" title={name}>{name}</p>
      <p className={cn("text-xs font-semibold", medal.text)}>{medal.label}</p>
      <div className={cn("mt-3 flex w-full flex-col items-center justify-start rounded-t-2xl border border-b-0 px-3 pb-5 pt-4 text-center", medal.plinth, medal.height)}>
        <p className="text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
          {hasScore(entry)
            ? entry.legacy
              ? <CountUp value={score(entry)} format={(n) => num.format(Math.round(n))} delay={delay + 300} />
              : <CountUp value={score(entry)} format={duration} delay={delay + 300} />
            : "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {entry.legacy ? "Learning points" : entry.hasPdfs ? `${num.format(entry.pdfsOpened)} PDFs opened` : "PDFs not recorded"}
        </p>
        {entry.rank > 1 && top > 0 && hasScore(entry) && (
          <p className="mt-2 text-[11px] text-muted-foreground">{num.format(Math.max(top - score(entry), 0))} {unit(entry.legacy)} behind #1</p>
        )}
      </div>
    </article>
  );
}

function Row({ entry, entries, index }: { entry: LeaderboardEntry; entries: LeaderboardEntry[]; index: number }) {
  const [ref, seen] = useInView<HTMLLIElement>();
  const top = entries[0] ? score(entries[0]) : 0;
  const ahead = entries[entry.rank - 2];
  const pct = top > 0 && hasScore(entry) ? Math.max((score(entry) / top) * 100, 2) : 0;
  const gap = ahead && hasScore(entry) ? Math.max(score(ahead) - score(entry), 0) : 0;
  const stagger = (index % PAGE_SIZE) * 45;

  return (
    <li
      ref={ref}
      className={cn(
        "flex items-start gap-3 rounded-xl px-3 py-3 transition-all duration-500 hover:bg-muted sm:gap-4",
        seen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      )}
      style={{ transitionDelay: `${stagger}ms` }}
    >
      <span className="w-7 pt-2.5 text-center text-sm font-semibold tabular-nums text-muted-foreground">{entry.rank}</span>
      <Avatar entry={entry} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-semibold text-foreground">{entry.displayName || "Learner"}</p>
          <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {hasScore(entry) ? (entry.legacy ? `${num.format(score(entry))} pts` : duration(score(entry))) : "No activity yet"}
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-1000 ease-out"
            style={{ width: seen ? `${pct}%` : "0%", transitionDelay: `${stagger + 150}ms` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <FileText size={11} aria-hidden="true" />
            {entry.legacy ? "Previous rankings" : entry.hasPdfs ? `${num.format(entry.pdfsOpened)} PDFs` : "PDFs not recorded"}
          </span>
          {gap > 0 && <span>{num.format(gap)} {unit(entry.legacy)} to pass #{ahead.rank}</span>}
        </div>
      </div>
    </li>
  );
}

/* ---------- page ---------- */

export function LeaderboardView() {
  const { back, navigate } = useApp();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let alive = true;
    getLeaderboard()
      .then((next) => { if (alive) setEntries(next); })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);

  const legacy = entries[0]?.legacy ?? false;
  const top = entries[0] ? score(entries[0]) : 0;
  const podium = [entries[1], entries[0], entries[2]].filter((e): e is LeaderboardEntry => !!e);

  const totals = useMemo(() => ({
    minutes: entries.reduce((s, e) => s + (e.legacy ? 0 : e.lectureMinutesWatched), 0),
    pdfs: entries.reduce((s, e) => s + (e.legacy ? 0 : e.pdfsOpened), 0),
  }), [entries]);

  const q = query.trim().toLowerCase();
  const list = q ? entries.filter((e) => (e.displayName || "learner").toLowerCase().includes(q)) : entries.slice(3);
  const shown = list.slice(0, visible);

  const onStageMove = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="pt-6 sm:pt-10">
        <GlassButton variant="secondary" size="sm" onClick={back}><ArrowLeft size={15} /> Back</GlassButton>

        <header className="flex flex-wrap items-end justify-between gap-6 py-8 sm:py-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Rankings</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Leaderboard</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Ranked by lecture minutes watched, then PDFs opened. Every lecture you finish moves you up.</p>
          </div>
          {!loading && !failed && entries.length > 0 && !legacy && (
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock size={13} aria-hidden="true" /> Total watched</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums text-foreground"><CountUp value={totals.minutes} format={(n) => duration(Math.round(n))} delay={200} /></dd>
              </div>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileText size={13} aria-hidden="true" /> PDFs opened</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums text-foreground"><CountUp value={totals.pdfs} format={(n) => num.format(Math.round(n))} delay={350} /></dd>
              </div>
            </dl>
          )}
        </header>

        {!loading && !failed && legacy && (
          <p role="status" className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm leading-6 text-amber-800 dark:text-amber-200">
            Showing previous points rankings until watched-minute or PDF activity is available.
          </p>
        )}

        {loading ? (
          <div role="status" aria-label="Loading leaderboard" className="space-y-6">
            <span className="sr-only">Loading leaderboard</span>
            <div className="flex items-end justify-center gap-3 sm:gap-5">
              {[200, 270, 170].map((h, i) => <div key={i} className="sb-skeleton w-full max-w-[220px] rounded-2xl" style={{ height: h }} />)}
            </div>
            <div className="sb-skeleton h-56 rounded-2xl" />
          </div>
        ) : failed ? (
          <GlassCard hover={false} className="px-6 py-14 text-center">
            <RefreshCw size={26} className="mx-auto text-primary" aria-hidden="true" />
            <h2 role="alert" className="mt-5 font-display text-xl font-bold text-foreground">Leaderboard did not load</h2>
            <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
            <GlassButton variant="secondary" className="mt-6" onClick={() => { setLoading(true); setFailed(false); setAttempt((v) => v + 1); }}>Reload leaderboard</GlassButton>
          </GlassCard>
        ) : entries.length === 0 ? (
          <GlassCard hover={false} className="px-6 py-14 text-center">
            <Trophy size={36} className="mx-auto text-amber-500" aria-hidden="true" />
            <h2 className="mt-5 font-display text-2xl font-bold text-foreground">No rankings yet</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Sign in and watch a lecture to take the first place on the podium.</p>
            <GlassButton variant="primary" className="mt-6" onClick={() => navigate({ view: "home" })}>Browse lectures <ArrowUpRight size={16} /></GlassButton>
          </GlassCard>
        ) : (
          <>
            {!q && podium.length > 0 && (
              <section
                aria-label="Top three learners"
                className="relative overflow-hidden rounded-3xl border border-border bg-surface px-3 pt-10 sm:px-8"
                onMouseMove={onStageMove}
              >
                <div className="mx-auto flex max-w-2xl items-end justify-center gap-2 sm:gap-4">
                  {podium.map((e) => <PodiumColumn key={e.id} entry={e} top={top} order={e.rank === 1 ? 2 : e.rank === 2 ? 0 : 1} />)}
                </div>
              </section>
            )}

            {(list.length > 0 || q) && (
              <GlassCard hover={false} className="mt-6 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <h2 className="font-display text-base font-bold text-foreground">{q ? "Search results" : "Everyone else"}</h2>
                  <label className="flex items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-2 text-muted-foreground focus-within:border-primary">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
                      placeholder="Find a learner"
                      aria-label="Find a learner"
                      className="w-36 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                </div>

                {shown.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">No learner matches &ldquo;{query.trim()}&rdquo;. Check the spelling.</p>
                ) : (
                  <ol className="p-2">{shown.map((e, i) => <Row key={e.id} entry={e} entries={entries} index={i} />)}</ol>
                )}

                {list.length > shown.length && (
                  <div className="px-5 pb-5 text-center">
                    <GlassButton variant="secondary" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                      Show {Math.min(PAGE_SIZE, list.length - shown.length)} more
                    </GlassButton>
                  </div>
                )}
              </GlassCard>
            )}
          </>
        )}

        <footer className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
          <BookOpen size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Your next lecture counts.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {legacy
                ? "Previous points rankings stay visible until watched-minute or PDF activity is available. Points are not converted into minutes."
                : "Rankings use saved lecture minutes, then PDF opens. Older points are not converted into minutes."}
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
