"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { getEnrolledBatchIds, signOutUser } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { GlassButton, GlassCard, SafeImage } from "./glass";

export function ProfileView() {
  const { back, navigate } = useApp();
  const user = useAuth();
  const [enrolled, setEnrolled] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    getEnrolledBatchIds(user.uid)
      .then((ids) => setEnrolled(ids.length))
      .catch(() => setEnrolled(0));
  }, [user]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutUser();
      navigate({ view: "home" });
    } finally {
      setSigningOut(false);
    }
  };

  if (user === undefined || !user) {
    return (
      <main className="flex-1 px-4 pb-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl pt-10">
          <GlassButton variant="secondary" size="sm" onClick={back}>
            <ArrowLeft size={15} /> Back
          </GlassButton>
        </div>
      </main>
    );
  }

  const displayName = user.displayName ?? "Learner";
  const email = user.email ?? "No email on file";

  return (
    <main className="flex-1 px-4 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-3xl pt-8 sm:pt-12">
        <GlassButton variant="secondary" size="sm" onClick={back}>
          <ArrowLeft size={15} /> Back
        </GlassButton>

        <GlassCard hover={false} className="mt-8 overflow-hidden">
          <div className="relative px-6 py-8 sm:px-10 sm:py-10">
            <div className="absolute inset-0 bg-gradient-to-b from-accent-soft to-transparent" />
            <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              <SafeImage
                src={user.photoURL ?? undefined}
                alt={displayName}
                className="h-24 w-24 rounded-3xl object-cover ring-4 ring-border"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Your account</p>
                <h1 className="mt-2 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{displayName}</h1>
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail size={15} className="shrink-0" /> {email}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 px-6 pb-8 sm:grid-cols-3 sm:px-10">
            <StatCard icon={<Sparkles size={18} />} label="Study ranking" value="See leaderboard" />
            <StatCard icon={<ShieldCheck size={18} />} label="Enrolled batches" value={enrolled === null ? "Loading..." : String(enrolled)} />
            <StatCard icon={<Mail size={18} />} label="Sign-in method" value="Google" />
          </div>
        </GlassCard>

        <div className="mt-6 flex justify-center">
          <GlassButton variant="ghost" size="md" onClick={handleSignOut} disabled={signingOut}>
            <LogOut size={16} /> {signingOut ? "Signing out..." : "Sign out"}
          </GlassButton>
        </div>
      </div>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted px-4 py-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
        {icon}
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
