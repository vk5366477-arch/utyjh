"use client";

import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------- Card ---------------------------------- */

export function GlassCard({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        hover &&
          "transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.25)]",
        className
      )}
    >
      {children}
    </div>
  );
}

/* --------------------------------- Button --------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
};

export const GlassButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none",
          "transition-[background-color,border-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.98]",
          "disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
          size === "sm" && "h-9 px-4 text-sm",
          size === "md" && "h-11 px-5 text-sm",
          size === "lg" && "h-12 px-7 text-base",
          size === "icon" && "h-10 w-10",
          variant === "primary" &&
            "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md",
          variant === "secondary" &&
            "border border-border bg-surface text-foreground hover:border-primary/50 hover:text-primary",
          variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
GlassButton.displayName = "GlassButton";

/* ---------------------------------- Badge ---------------------------------- */

export function GlassBadge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "primary" && "bg-accent-soft text-accent-soft-foreground",
        tone === "success" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        tone === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "danger" && "bg-red-500/12 text-red-700 dark:text-red-300",
        className
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Skeleton --------------------------------- */

export function GlassSkeleton({ className }: { className?: string }) {
  return <div className={cn("sb-skeleton rounded-2xl", className)} />;
}

/* ------------------------------- Section heading ------------------------------- */

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
      )}
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {subtitle && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/* ------------------------------ Safe remote image ------------------------------ */

export function SafeImage({
  src,
  alt,
  className,
  fallback = "/logo.png",
}: {
  src?: string;
  alt: string;
  className?: string;
  fallback?: string;
}) {
  const url = src && src.startsWith("http") ? src : fallback;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={className}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== fallback && !img.src.endsWith(fallback)) img.src = fallback;
      }}
    />
  );
}

/* ---------------------------------- Empty state ---------------------------------- */

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-8 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-primary">
          {icon}
        </div>
      )}
      <p className="font-display font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
