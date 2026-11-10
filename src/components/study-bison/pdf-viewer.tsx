"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Maximize,
  Minimize,
  AlertCircle,
  FileText,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { GlassButton } from "./glass";

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: unknown) => { promise: Promise<void>; cancel: () => void };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void };
type RenderTask = { promise: Promise<void>; cancel: () => void };

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const PAGE_PAD = 16;
const PAGE_GAP = 12;

/* ===========================================================================
 *  PdfViewerView — full-page PDF viewer (continuous scroll)
 * =========================================================================*/

export function PdfViewerView() {
  const { back } = useApp();
  const appState = useApp();
  const url = appState.videoId || "";
  const title = appState.lectureTitle || "PDF Document";

  return (
    <main className="flex-1 flex flex-col w-full">
      <PdfScrollViewer url={url} title={title} onClose={back} showBack fullscreenable />
    </main>
  );
}

/* ===========================================================================
 *  PdfScrollViewer — continuous-scroll PDF renderer
 *  All pages render in a single scrollable column. Only pages near the
 *  viewport are actually painted (windowed rendering) for performance.
 * =========================================================================*/

export function PdfScrollViewer({
  url,
  title,
  onClose,
  showBack = false,
  fullscreenable = false,
  compact = false,
}: {
  url: string;
  title: string;
  onClose: () => void;
  showBack?: boolean;
  fullscreenable?: boolean;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PdfDoc | null>(null);
  const pageBaseWidthRef = useRef(0);
  const userZoomedRef = useRef(false);

  // Each page gets its own canvas ref via a map
  const canvasRefs = useRef<Map<number, HTMLCanvasElement | null>>(new Map());
  const renderTaskRefs = useRef<Map<number, RenderTask>>(new Map());
  const pageHeightsRef = useRef<number[]>([]);
  const pageElementsRef = useRef<(HTMLDivElement | null)[]>([]);

  const [loading, setLoading] = useState(() => !!url);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [currentPage, setCurrentPage] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  const [pagePlaceholders, setPagePlaceholders] = useState<{ width: number; height: number }[]>([]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /** Scale that fits one page width inside the current scroll container. */
  const fitScale = useCallback(() => {
    const el = scrollRef.current;
    const base = pageBaseWidthRef.current;
    if (!el || !base) return null;
    const avail = Math.max(0, el.clientWidth - PAGE_PAD * 2);
    if (avail <= 0) return null;
    return Math.max(MIN_SCALE, Math.min(avail / base, MAX_SCALE));
  }, []);

  /** Render a single page to its canvas. */
  const renderPage = useCallback(async (pageNum: number, desiredScale: number) => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRefs.current.get(pageNum);
    if (!pdf || !canvas) return;

    // Cancel any in-flight render for this page
    const existing = renderTaskRefs.current.get(pageNum);
    if (existing) {
      try { existing.cancel(); } catch { /* noop */ }
    }

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: desiredScale });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      renderTaskRefs.current.set(pageNum, renderTask);
      await renderTask.promise;
    } catch {
      /* render cancelled or failed — noop */
    }
  }, []);

  /** Determine which pages are visible and render them. */
  const renderVisiblePages = useCallback(() => {
    if (!pdfDocRef.current || numPages === 0) return;
    const scroll = scrollRef.current;
    if (!scroll) return;

    const scrollTop = scroll.scrollTop;
    const viewportH = scroll.clientHeight;
    const renderMargin = viewportH * 1.5; // render pages 1.5 viewport heights above/below

    let cumulative = 0;
    for (let i = 0; i < numPages; i++) {
      const pageTop = cumulative;
      const pageH = pageHeightsRef.current[i] ?? 800;
      const pageBottom = pageTop + pageH;
      cumulative = pageBottom + PAGE_GAP;

      const isVisible = pageBottom >= scrollTop - renderMargin && pageTop <= scrollTop + viewportH + renderMargin;
      const canvas = canvasRefs.current.get(i + 1);

      if (isVisible && canvas) {
        // Check if already rendered at correct size
        const expectedH = pageH;
        if (canvas.dataset.renderedScale !== String(scale) || canvas.height === 0) {
          canvas.dataset.renderedScale = String(scale);
          void renderPage(i + 1, scale);
        }
      }
    }
  }, [numPages, scale, renderPage]);

  /** Track which page is currently in view based on scroll position. */
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || numPages === 0) return;
    const scroll = scrollRef.current;
    const scrollTop = scroll.scrollTop + scroll.clientHeight / 3;

    let cumulative = 0;
    let found = 1;
    for (let i = 0; i < numPages; i++) {
      const pageH = pageHeightsRef.current[i] ?? 800;
      cumulative += pageH + PAGE_GAP;
      if (scrollTop < cumulative) {
        found = i + 1;
        break;
      }
      found = i + 1;
    }
    setCurrentPage(found);
    renderVisiblePages();
  }, [numPages, renderVisiblePages]);

  /** Load the PDF document. */
  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    userZoomedRef.current = false;
    canvasRefs.current.clear();
    renderTaskRefs.current.clear();
    pageHeightsRef.current = [];
    setPagePlaceholders([]);

    const proxyUrl = url.startsWith("/") ? url : `/api/pdf?url=${encodeURIComponent(url)}`;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url
        ).toString();
        const loadingTask = pdfjsLib.getDocument({ url: proxyUrl });
        const pdf = (await loadingTask.promise) as unknown as PdfDoc;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);

        // Probe page 1 for base width and compute all page heights at fit scale
        const page1 = await pdf.getPage(1);
        if (cancelled) return;
        pageBaseWidthRef.current = page1.getViewport({ scale: 1 }).width;
        const fit = fitScale() ?? 1.2;
        setScale(fit);

        // Compute placeholder sizes for all pages
        const placeholders: { width: number; height: number }[] = [];
        const heights: number[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = i === 1 ? page1 : await pdf.getPage(i);
          if (cancelled) return;
          const vp = page.getViewport({ scale: fit });
          placeholders.push({ width: Math.floor(vp.width), height: Math.floor(vp.height) });
          heights.push(Math.floor(vp.height));
        }
        pageHeightsRef.current = heights;
        setPagePlaceholders(placeholders);
        setLoading(false);

        // Initial render of visible pages
        requestAnimationFrame(() => renderVisiblePages());
      } catch {
        if (!cancelled) {
          setError("Could not load this PDF. It may be blocked by CORS or unavailable.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRefs.current.forEach((task) => {
        try { task.cancel(); } catch { /* noop */ }
      });
      renderTaskRefs.current.clear();
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy(); } catch { /* noop */ }
        pdfDocRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  /** Re-render all visible pages when scale changes. */
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0 || loading) return;

    // Update placeholder heights for new scale
    (async () => {
      const pdf = pdfDocRef.current;
      if (!pdf) return;
      const heights: number[] = [];
      const placeholders: { width: number; height: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale });
          heights.push(Math.floor(vp.height));
          placeholders.push({ width: Math.floor(vp.width), height: Math.floor(vp.height) });
        } catch { heights.push(800); placeholders.push({ width: 600, height: 800 }); }
      }
      pageHeightsRef.current = heights;
      setPagePlaceholders(placeholders);
      // Mark all canvases as needing re-render
      canvasRefs.current.forEach((c) => { if (c) c.dataset.renderedScale = ""; });
      requestAnimationFrame(() => renderVisiblePages());
    })();
  }, [scale, numPages, loading, renderVisiblePages]);

  /** Resize observer for fit-to-width. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (userZoomedRef.current) return;
        const fit = fitScale();
        if (fit) setScale(fit);
      });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("orientationchange", onResize);
    };
  }, [fitScale]);

  const zoomIn = () => { userZoomedRef.current = true; setScale((s) => Math.min(s + 0.25, MAX_SCALE)); };
  const zoomOut = () => { userZoomedRef.current = true; setScale((s) => Math.max(s - 0.25, MIN_SCALE)); };
  const refit = () => { userZoomedRef.current = false; const fit = fitScale(); if (fit) setScale(fit); };

  const toggleFullscreen = () => {
    const el = scrollRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  };

  /** Jump to a specific page. */
  const jumpToPage = (pageNum: number) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let cumulative = 0;
    for (let i = 0; i < pageNum - 1; i++) {
      cumulative += (pageHeightsRef.current[i] ?? 800) + PAGE_GAP;
    }
    scroll.scrollTo({ top: cumulative, behavior: "smooth" });
  };

  if (!url) {
    return (
      <main className="flex-1 px-4 pb-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl pt-10">
          <GlassButton variant="secondary" size="sm" onClick={onClose}>
            <ArrowLeft size={15} /> Back
          </GlassButton>
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="text-muted-foreground" size={32} />
            <p className="text-sm text-muted-foreground">No document was provided to display.</p>
          </div>
        </div>
      </main>
    );
  }

  const downloadHref = url.startsWith("/") ? url : `/api/pdf?url=${encodeURIComponent(url)}`;
  const toolBtn = compact ? "h-7 w-7" : "h-8 w-8 sm:h-9 sm:w-9";
  const toolIcon = compact ? 14 : 16;

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1.5 sm:gap-2 px-2 py-2 sm:px-5 sm:py-3 bg-surface/95 backdrop-blur-md border-b border-border shrink-0">
        {showBack && (
          <GlassButton variant="secondary" size="sm" onClick={onClose} className="shrink-0">
            <ArrowLeft size={15} /> <span className="hidden sm:inline">Back</span>
          </GlassButton>
        )}
        {!compact && (
          <p className="min-w-0 flex-1 truncate text-xs sm:text-sm font-semibold text-foreground/90 order-3 sm:order-none basis-full sm:basis-auto">{title}</p>
        )}
        {compact && <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground/90">{title}</p>}

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={zoomOut} disabled={loading || !!error} className={`flex ${toolBtn} items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40`} aria-label="Zoom out">
            <ZoomOut size={toolIcon} />
          </button>
          <button onClick={refit} disabled={loading || !!error} className={`min-w-[${compact ? "2.5rem" : "3rem"}] sm:min-w-[3.5rem] text-center text-[${compact ? "10px" : "11px"}] sm:text-xs font-semibold tabular-nums text-muted-foreground hover:text-foreground disabled:opacity-40 px-1`} aria-label="Fit to width" title="Fit to width">
            {Math.round(scale * 100)}%
          </button>
          <button onClick={zoomIn} disabled={loading || !!error} className={`flex ${toolBtn} items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40`} aria-label="Zoom in">
            <ZoomIn size={toolIcon} />
          </button>
        </div>

        <a href={downloadHref} target="_blank" rel="noreferrer" download className="shrink-0">
          <GlassButton variant="secondary" size={compact ? "sm" : "sm"}>
            <Download size={compact ? 14 : 15} /> {!compact && <span className="hidden sm:inline">Download</span>}
          </GlassButton>
        </a>
        {fullscreenable && (
          <button onClick={toggleFullscreen} className={`flex ${toolBtn} shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground`} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize size={toolIcon} /> : <Maximize size={toolIcon} />}
          </button>
        )}
        {compact && (
          <button onClick={onClose} className={`flex ${toolBtn} shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground`} aria-label="Close panel">
            <X size={toolIcon} />
          </button>
        )}
      </div>

      {/* Continuous scroll area */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto sb-scroll bg-muted min-h-0">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <Loader2 className="animate-spin text-primary" size={32} />
            <p className="text-sm text-muted-foreground">Loading document...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
            <AlertCircle className="text-red-400" size={32} />
            <p className="max-w-md text-sm text-foreground">{error}</p>
            <a href={downloadHref} target="_blank" rel="noreferrer">
              <GlassButton variant="primary" size="sm">
                <FileText size={14} /> Open in new tab
              </GlassButton>
            </a>
          </div>
        )}

        {!loading && !error && numPages > 0 && (
          <div className="flex flex-col items-center py-3 sm:py-4 px-2 sm:px-4" style={{ gap: `${PAGE_GAP}px` }}>
            {Array.from({ length: numPages }).map((_, i) => {
              const pageNum = i + 1;
              const ph = pagePlaceholders[i] ?? { width: 600, height: 800 };
              return (
                <div
                  key={pageNum}
                  ref={(el) => { pageElementsRef.current[i] = el; }}
                  className="relative bg-white rounded-lg shadow-2xl max-w-full"
                  style={{ width: ph.width, height: ph.height }}
                >
                  <canvas
                    ref={(el) => { canvasRefs.current.set(pageNum, el); }}
                    className="rounded-lg max-w-full"
                  />
                  {/* Page number badge */}
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/80">
                    {pageNum} / {numPages}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Page indicator */}
      {!loading && !error && numPages > 0 && (
        <div className="sticky bottom-0 z-20 flex items-center justify-center gap-3 bg-surface/95 backdrop-blur-md border-t border-border px-3 py-2 sm:py-2.5 shrink-0">
          <button onClick={() => jumpToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className={`flex ${toolBtn} items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30`} aria-label="Previous page">
            <ArrowLeft size={compact ? 14 : 18} />
          </button>
          <button onClick={() => jumpToPage(currentPage)} className="text-xs font-semibold tabular-nums text-foreground/80 hover:text-primary transition-colors">
            Page {currentPage} <span className="text-muted-foreground">of {numPages}</span>
          </button>
          <button onClick={() => jumpToPage(Math.min(numPages, currentPage + 1))} disabled={currentPage >= numPages} className={`flex ${toolBtn} items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30`} aria-label="Next page">
            <ArrowLeft size={compact ? 14 : 18} className="rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
 *  PdfPanel — embeddable PDF viewer for sidebar use alongside video
 *  Now uses the same continuous-scroll renderer.
 * =========================================================================*/

export function PdfPanel({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <PdfScrollViewer
      url={url}
      title={title}
      onClose={onClose}
      compact
    />
  );
}
