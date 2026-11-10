"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { firebaseAuth, enrollInBatch, getEnrolledBatchIds, signInWithGoogle } from "@/lib/firebase";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage, EmptyState } from "./glass";
import { BookOpen, ChevronDown, Search, Check, Loader2, ArrowRight, Circle } from "lucide-react";

interface CatalogBatch {
  _id: string;
  name: string;
  byName: string;
  startDate?: string;
  endDate?: string;
  language?: string;
  previewImage?: string;
  feeTotal?: number;
  type?: string;
  slug?: string;
}

const PAGE_SIZE = 24;

export function BatchesView() {
  const { navigate, searchQuery, setSearchQuery } = useApp();
  const [batches, setBatches] = useState<CatalogBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    fetch("/api/batches", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { success?: boolean; batches?: CatalogBatch[]; error?: string }) => {
        if (!alive) return;
        if (data.success && Array.isArray(data.batches)) {
          setBatches(data.batches);
        } else {
          setError(data.error ?? "Unable to load courses");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("Unable to connect to the course catalog");
        setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    getEnrolledBatchIds(user.uid).then((ids) => setEnrolledIds(new Set(ids))).catch(() => {});
  }, []);

  const saveEnrollment = async (batch: CatalogBatch) => {
    if (enrolledIds.has(batch._id)) return;
    setSavingId(batch._id);
    try {
      let user = firebaseAuth.currentUser;
      if (!user) {
        await signInWithGoogle();
        user = firebaseAuth.currentUser;
      }
      if (!user) return;
      await enrollInBatch({ userId: user.uid, batch: { id: batch._id, name: batch.name, image: batch.previewImage, byName: batch.byName } });
      setEnrolledIds((current) => new Set(current).add(batch._id));
    } catch {
      setError("Sign in is required to enroll in a batch.");
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return batches;
    return batches.filter((batch) =>
      `${batch.name} ${batch.byName} ${batch.language ?? ""}`.toLowerCase().includes(query)
    );
  }, [batches, searchQuery]);

  const openBatch = (batch: CatalogBatch) =>
    navigate({
      view: "batch",
      batchId: batch._id,
      batchName: batch.name,
      batchImage: batch.previewImage,
    });

  return (
    <main className="w-full min-w-0 flex-1 text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Header */}
        <header className="sb-fade-up space-y-2 border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Catalog</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">All batches</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {loading ? "Loading courses..." : `${batches.length.toLocaleString()} batches available`} · Find your course and start learning
          </p>
        </header>

        {/* Search */}
        <label className="flex h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 text-muted-foreground shadow-sm transition-colors duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
          <Search size={18} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search batches by name or category..."
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search batches"
          />
        </label>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <GlassCard key={index} hover={false} className="overflow-hidden p-3">
                <GlassSkeleton className="aspect-video rounded-xl" />
                <div className="space-y-3 p-2 pt-4">
                  <GlassSkeleton className="h-4 w-4/5 rounded-md" />
                  <GlassSkeleton className="h-3 w-1/2 rounded-md" />
                  <GlassSkeleton className="h-10 w-full rounded-xl" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : error ? (
          <EmptyState icon={<Search size={22} />} title="Courses are unavailable" hint={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<BookOpen size={22} />} title="No batches found" hint="Try a different search term." />
        ) : (
          <BatchGrid batches={filtered} onOpen={openBatch} onEnroll={saveEnrollment} enrolledIds={enrolledIds} savingId={savingId} />
        )}
      </div>
    </main>
  );
}

function BatchGrid({ batches, onOpen, onEnroll, enrolledIds, savingId }: { batches: CatalogBatch[]; onOpen: (batch: CatalogBatch) => void; onEnroll: (batch: CatalogBatch) => void; enrolledIds: Set<string>; savingId: string | null }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  return (
    <>
      <div className="sb-fade-up grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {batches.slice(0, visible).map((batch) => <BatchCard key={batch._id} batch={batch} onOpen={() => onOpen(batch)} onEnroll={() => onEnroll(batch)} enrolled={enrolledIds.has(batch._id)} saving={savingId === batch._id} />)}
      </div>
      {visible < batches.length && (
        <div className="mt-8 flex justify-center">
          <GlassButton variant="secondary" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
            Load more <ChevronDown size={16} />
          </GlassButton>
        </div>
      )}
    </>
  );
}

function BatchCard({ batch, onOpen, onEnroll, enrolled, saving }: { batch: CatalogBatch; onOpen: () => void; onEnroll: () => void; enrolled: boolean; saving: boolean }) {
  const fee = typeof batch.feeTotal === "number" && batch.feeTotal > 0 ? batch.feeTotal : 1799;
  const originalFee = Math.ceil(fee * 1.95 / 100) * 100;
  const discount = Math.max(1, Math.round((1 - fee / originalFee) * 100));

  return (
    <GlassCard className="group flex flex-col overflow-hidden p-3">
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer text-left">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-muted">
          <SafeImage
            src={batch.previewImage}
            alt={batch.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {batch.language && (
            <span className="absolute left-2.5 top-2.5">
              <GlassBadge tone="neutral" className="bg-surface/90 backdrop-blur-sm">{batch.language}</GlassBadge>
            </span>
          )}
        </div>
        <div className="space-y-3 px-2 pb-3 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{batch.byName || "Class 12 JEE"}</p>
          <h2 className="line-clamp-2 min-h-12 font-display text-base font-bold leading-snug tracking-tight text-foreground sm:text-lg">{batch.name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><BookOpen size={14} /> {batch.type ?? "JEE 2027"}</span>
            <span className="flex items-center gap-1.5"><Circle size={8} className="fill-destructive text-destructive" /> Ongoing</span>
          </div>
          <p className="text-xs text-muted-foreground">Started on {batch.startDate ?? "28th Sep’26"}</p>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-2 pb-1 pt-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-lg font-bold text-foreground">₹{fee.toLocaleString("en-IN")}</span>
            <span className="text-xs text-muted-foreground line-through">₹{originalFee.toLocaleString("en-IN")}</span>
          </p>
          <div className="mt-1">
            <GlassBadge tone="success">{discount}% off</GlassBadge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GlassButton
            type="button"
            variant={enrolled ? "secondary" : "primary"}
            size="sm"
            disabled={enrolled || saving}
            onClick={onEnroll}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : enrolled ? <Check size={14} /> : null}
            {saving ? "Saving..." : enrolled ? "Enrolled" : "Buy Now"}
          </GlassButton>
          <GlassButton
            type="button"
            variant="secondary"
            size="icon"
            aria-label={`Open ${batch.name}`}
            onClick={onOpen}
          >
            <ArrowRight size={16} />
          </GlassButton>
        </div>
      </div>
    </GlassCard>
  );
}
