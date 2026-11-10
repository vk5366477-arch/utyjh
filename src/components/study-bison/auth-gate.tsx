"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { finishGoogleRedirect, signInWithGoogle, registerLeaderboardUser } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { GlassButton } from "./glass";

export function AuthGate({ children }: { children: ReactNode }) {
  const user = useAuth();
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (user) {
      setChecking(false);
      void registerLeaderboardUser(user).catch(() => {});
    }

    const completeRedirect = async () => {
      try {
        const result = await finishGoogleRedirect();
        if (active && result?.user) setChecking(false);
      } catch (reason: unknown) {
        if (active) setError(getSignInMessage(reason));
      } finally {
        if (active) setChecking(false);
      }
    };

    void completeRedirect();
    const timer = setTimeout(() => { if (active) setChecking(false); }, 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [user]);

  const login = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (reason: unknown) {
      setError(getSignInMessage(reason));
    } finally {
      setSigningIn(false);
    }
  };

  if (checking || user === undefined) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={28} />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-background p-5">
        <section className="sb-fade-up w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] sm:p-10">
          <span className="mx-auto block h-16 w-16 overflow-hidden rounded-2xl ring-1 ring-border">
            <img src="/logo.png" alt="Quantica Digital logo" className="h-full w-full object-cover" />
          </span>
          <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-foreground">Welcome to Quantica Digital</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Sign in with Google to access your batches, continue lectures, and track your progress.</p>
          <GlassButton variant="primary" size="lg" className="mt-8 w-full" onClick={login} disabled={signingIn}>
            {signingIn ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
            {signingIn ? "Connecting to Google..." : "Continue with Google"}
          </GlassButton>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Your Google account keeps your learning progress secure.</p>
          {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

function getSignInMessage(reason: unknown): string {
  const code = (reason as { code?: string }).code;
  if (code === "auth/popup-closed-by-user") return "The Google sign-in window was closed before sign-in finished. Please try again.";
  if (code === "auth/account-exists-with-different-credential") return "This Google account is already connected with another sign-in method.";
  if (code === "auth/unauthorized-domain") return "This app address is not enabled for Google sign-in yet. Add the current website address to Firebase Authorized domains.";
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled in the Firebase Authentication settings yet.";
  if (code === "auth/network-request-failed") return "Google sign-in needs an active internet connection. Please try again.";
  return "Google sign-in could not be completed. Please try again.";
}
