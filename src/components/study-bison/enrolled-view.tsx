"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getEnrolledBatchIds } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage, EmptyState } from "./glass";
import { GraduationCap, BookOpen } from "lucide-react";

interface EnrolledBatch {
  id: string;
  name: string;
  image?: string;
  byName?: string;
}

export function EnrolledView() {
  const { navigate } = useApp();
  const user = useAuth();
  const authLoading = user === undefined;
  const [batches, setBatches] = useState<EnrolledBatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = async () => {
    setLoading(true);
    if (!user) {
      setBatches([]);
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    try {
      const ids = await getEnrolledBatchIds(user.uid);
      // Fetch catalog to enrich names/images when possible.
      let catalog: { _id: string; name: string; previewImage?: string; byName?: string }[] = [];
      try {
        const res = await fetch("/api/batches");
        const d = await res.json();
        if (d?.success && Array.isArray(d.batches)) catalog = d.batches;
      } catch {
        catalog = [];
      }
      const enriched = ids.map((id) => {
        const match = catalog.find((b) => b._id === id);
        return {
          id,
          name: match?.name ?? "Batch",
          image: match?.previewImage,
          byName: match?.byName,
        };
      });
      setBatches(enriched);
      setNeedsAuth(false);
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [user, authLoading]);

  const openBatch = (b: EnrolledBatch) =>
    navigate({ view: "batch", batchId: b.id, batchName: b.name, batchImage: b.image });

  const count = batches?.length ?? 0;

  return (
    <main className="w-full min-w-0 flex-1 text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Header */}
        <header className="sb-fade-up space-y-2 border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">My learning</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Enrolled batches</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {loading ? "Loading your batches..." : count > 0 ? `${count} enrolled ${count === 1 ? "batch" : "batches"}` : "Pick a batch from the catalog to begin"}
          </p>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <GlassCard key={index} hover={false} className="overflow-hidden p-3">
                <GlassSkeleton className="aspect-video rounded-xl" />
                <div className="space-y-3 p-2 pt-4">
                  <GlassSkeleton className="h-4 w-4/5 rounded-md" />
                  <GlassSkeleton className="h-3 w-1/2 rounded-md" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : needsAuth ? (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title="Sign in to see your enrolled batches"
            hint="Your enrollments are tied to your account."
          />
        ) : !batches || batches.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title="No enrolled batches yet"
            hint="Enroll in a batch from the catalog to start learning."
          />
        ) : (
          <div className="sb-fade-up grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {batches.map((b) => (
              <GlassCard key={b.id} className="flex flex-col overflow-hidden p-3">
                <button type="button" onClick={() => openBatch(b)} className="group block w-full cursor-pointer text-left">
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-muted">
                    <SafeImage
                      src={b.image}
                      alt={b.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute left-2.5 top-2.5">
                      <GlassBadge tone="success"><GraduationCap size={11} /> Enrolled</GlassBadge>
                    </span>
                  </div>
                  <div className="space-y-2 px-2 pb-3 pt-4">
                    <h2 className="line-clamp-2 min-h-11 font-display text-base font-bold leading-snug tracking-tight text-foreground">{b.name}</h2>
                    <p className="line-clamp-1 text-sm text-muted-foreground">For {b.byName || "serious learners"}</p>
                  </div>
                </button>

                <div className="mt-auto px-2 pb-1 pt-4">
                  <GlassButton variant="primary" size="sm" className="w-full" onClick={() => openBatch(b)}>
                    <BookOpen size={14} /> Continue learning
                  </GlassButton>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
