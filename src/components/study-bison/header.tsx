"use client";

import { useEffect, useState } from "react";
import { useApp, type ViewName } from "@/lib/store";
import { signInWithGoogle } from "@/lib/firebase";
import { TelegramJoinButton } from "./telegram-popup";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { BookOpen, CalendarRange, GraduationCap, Home, LogIn, Moon, Sun, Trophy, User } from "lucide-react";

const NAV_ITEMS: { view: ViewName; label: string; icon: React.ReactNode }[] = [
  { view: "home", label: "Today", icon: <Home size={18} /> },
  { view: "planner", label: "Planner", icon: <CalendarRange size={18} /> },
  { view: "batches", label: "Batches", icon: <BookOpen size={18} /> },
  { view: "enrolled", label: "My batches", icon: <GraduationCap size={18} /> },
  { view: "leaderboard", label: "Ranks", icon: <Trophy size={18} /> },
  { view: "profile", label: "Profile", icon: <User size={18} /> },
];

const THEME_KEY = "quantica-theme";

export function SiteHeader() {
  const { view, navigate } = useApp();
  const user = useAuth();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const isDark = window.localStorage.getItem(THEME_KEY) !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
  };

  const go = (target: ViewName) => {
    navigate({ view: target });
  };

  const isActive = (target: ViewName) => {
    if (target === "batches") return ["batches", "batch", "subject", "topic", "watch", "pdf"].includes(view);
    return view === target;
  };

  const initial = (user?.displayName?.[0] ?? "U").toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => go("home")}
            className="group flex min-w-0 shrink-0 cursor-pointer items-center gap-3"
            aria-label="Quantica Digital home"
          >
            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-xl ring-1 ring-border">
              <img src="/logo.png" alt="" className="h-full w-full object-cover" />
            </span>
            <span className="truncate font-display text-sm font-bold tracking-wide text-foreground">Quantica Digital</span>
          </button>

          {/* Desktop nav */}
          <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {NAV_ITEMS.filter((item) => item.view !== "profile").map((item) => {
              const active = isActive(item.view);
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => go(item.view)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
                    active ? "bg-accent-soft text-accent-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <TelegramJoinButton />

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
              title={`Switch to ${dark ? "light" : "dark"} mode`}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => go("profile")}
                aria-label="Open profile"
                title={user.displayName ?? "Your profile"}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold text-primary-foreground ring-2 ring-border transition-transform hover:scale-105"
              >
                {user.photoURL ? <img src={user.photoURL} alt="" className="h-full w-full object-cover" /> : initial}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="hidden h-9 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 sm:inline-flex"
              >
                <LogIn size={15} />
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom navbar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch justify-around">
          {NAV_ITEMS.filter((item) => item.view !== "profile").map((item) => {
            const active = isActive(item.view);
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => go(item.view)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", active && "bg-accent-soft")}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
