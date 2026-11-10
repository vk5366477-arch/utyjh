"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Loader2,
  Gauge,
  RotateCcw,
  RotateCw,
  Paperclip,
  X,
  Settings,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ListVideo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { firebaseAuth, recordLectureProgress } from "@/lib/firebase";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage } from "./glass";
import { PdfPanel } from "./pdf-viewer";
import { DownloadButton } from "./download-manager";

/* ===========================================================================
 *  Types
 * =========================================================================*/

export interface StreamResolution {
  playable: boolean;
  kind: "mp4" | "hls" | "dash" | "youtube" | "unknown";
  url: string;
  reason?: string;
  folder?: string;
  engine?: "hls" | "dash" | "native";
  manifestVia?: string;
  clearKey?: string;
  clearKid?: string;
  sig?: string;
  title?: string;
  duration?: string;
}

interface NoteDoc { id: string; name: string; url: string; note?: string; }
interface PlaylistLecture { id: string; title: string; thumbnail?: string; duration?: string; isLocked?: boolean; }

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (r: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (v: number) => void;
  getVolume: () => number;
  getPlayerState: () => number;
  loadVideoById: (id: string) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number; target: YTPlayer }) => void;
            onError?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        UNSTARTED: number; ENDED: number; PLAYING: number;
        PAUSED: number; BUFFERING: number; CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/* ===========================================================================
 *  YouTube IFrame API loader (singleton)
 * =========================================================================*/

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const existing = document.getElementById("yt-iframe-api");
    if (!existing) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
  });
  return ytApiPromise;
}

/* ===========================================================================
 *  WatchView — the single entry point (replaces player-view.tsx)
 *  Fetches lecture data, resolves streams, renders layout + player
 * =========================================================================*/

export function WatchView({
  batchId,
  subjectSlug,
  topicId,
  contentId,
  playerOnly = false,
}: {
  batchId: string;
  subjectSlug: string;
  topicId?: string;
  contentId: string;
  playerOnly?: boolean;
}) {
  const { navigate, back } = useApp();
  const appState = useApp();

  const [videoId, setVideoId] = useState<string | undefined>(appState.videoId || undefined);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [urlType, setUrlType] = useState<string>("youtube");
  const [stream, setStream] = useState<StreamResolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [title, setTitle] = useState(appState.lectureTitle ?? "");
  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [playlist, setPlaylist] = useState<PlaylistLecture[]>([]);
  const [loading, setLoading] = useState(!appState.videoId);
  const [bookmarkSet, setBookmarkSet] = useState(false);
  const [pdfPanel, setPdfPanel] = useState<{ url: string; name: string } | null>(null);


  /* fetch lecture detail */
  useEffect(() => {
    let alive = true;
    fetch(`/api/batches/${batchId}/subjects/${encodeURIComponent(subjectSlug)}/schedule/${contentId}`)
      .then((r) => r.json())
      .then(async (d) => {
        if (!alive || !d?.success) { if (alive) setLoading(false); return; }
        const lec = d.lecture ?? {};
        if (lec.title) setTitle(lec.title);
        setNotes(d.notes ?? []);
        const type = (lec.urlType ?? "youtube").toLowerCase();
        setUrlType(type);
        setVideoId(type === "youtube" ? (lec.videoId ?? lec.videoUrl) : undefined);
        setVideoUrl(lec.videoUrl || undefined);
        setLoading(false);
        if (type !== "youtube") {
          const apiId = lec.videoApiId ?? lec.videoId ?? "";
          const rawUrl = lec.videoUrl || "";
          if (apiId) {
            setResolving(true);
            const q = rawUrl ? `?url=${encodeURIComponent(rawUrl)}` : "";
            fetch(`/api/streams/${encodeURIComponent(apiId)}${q}`)
              .then((r) => r.json())
              .then((sj) => { if (alive) { setStream({ ...sj, playable: !!sj.playable }); setResolving(false); } })
              .catch(() => {
                if (alive) {
                  setResolving(false);
                  if (rawUrl) setStream({ playable: true, kind: classifyUrl(rawUrl), url: rawUrl, engine: "native" });
                  else setStream({ playable: false, kind: "unknown", url: "", reason: "Could not resolve stream." });
                }
              });
          } else if (rawUrl) {
            setStream({ playable: true, kind: classifyUrl(rawUrl), url: rawUrl, engine: "native" });
          } else {
            setStream({ playable: false, kind: "unknown", url: "", reason: "No stream attached yet." });
          }
        }
      })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [batchId, subjectSlug, contentId]);

  /* playlist */
  useEffect(() => {
    if (!topicId) return;
    let alive = true;
    fetch(`/api/batches/${batchId}/subjects/${encodeURIComponent(subjectSlug)}/contents?contentType=videos&tag=${encodeURIComponent(topicId)}&pages=6`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setPlaylist((d?.items ?? []).map((x: PlaylistLecture) => ({
          id: x.id, title: x.title, thumbnail: x.thumbnail, duration: x.duration, isLocked: x.isLocked,
        })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [batchId, subjectSlug, topicId]);

  /* bookmark */
  useEffect(() => {
    let alive = true;
    fetch("/api/bookmarks")
      .then((r) => r.json())
      .then((d) => { if (alive) setBookmarkSet((d?.items ?? []).some((b: { contentId: string }) => b.contentId === contentId)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [contentId]);

  const toggleBookmark = async () => {
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "lecture", contentId, batchId,
        batchName: appState.batchName ?? "",
        subjectName: appState.subjectName ?? "",
        title, subtitle: appState.topicName ?? "",
        url: videoId, urlType: urlType === "youtube" ? "youtube" : stream?.kind ?? "hls",
        thumbnail: "",
      }),
    });
    const d = await res.json();
    if (d?.success) setBookmarkSet(d.bookmarked);
  };

  const savePosition = useCallback((pos: number) => {
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId, batchName: appState.batchName ?? "", batchImage: appState.batchImage ?? "",
        subjectId: subjectSlug, subjectName: appState.subjectName ?? prettify(subjectSlug),
        subjectSlug, topicId, topicName: appState.topicName ?? "",
        contentId, lectureTitle: title, videoId,
        videoType: urlType === "youtube" ? "youtube" : stream?.kind ?? "hls",
        positionSec: Math.floor(pos),
      }),
    }).catch(() => {});
    const user = firebaseAuth.currentUser;
    const minute = Math.floor(pos / 60);
    if (user && minute > leaderboardMinuteRef.current) {
      leaderboardMinuteRef.current = minute;
      recordLectureProgress({
        userId: user.uid, userName: user.displayName ?? "Learner",
        photoURL: user.photoURL, batchId, contentId, seconds: pos,
      }).catch(() => {});
    }
  }, [batchId, subjectSlug, topicId, contentId, title, videoId, urlType, stream, appState.batchName, appState.batchImage, appState.subjectName, appState.topicName]);

  const historyInitRef = useRef<string | null>(null);
  const leaderboardMinuteRef = useRef(-1);
  useEffect(() => {
    if (historyInitRef.current !== contentId) {
      historyInitRef.current = contentId;
      savePosition(0);
    }
  }, [contentId, savePosition]);

  const openNote = (url: string, name: string) => { setPdfPanel({ url, name }); };
  const handlePosition = useCallback((pos: number) => { savePosition(pos); }, [savePosition]);

  /* Determine the resolved stream to pass to the player */
  const resolvedStream: StreamResolution | null =
    urlType === "youtube" && videoId
      ? { playable: true, kind: "youtube", url: videoId, engine: "native" }
      : stream?.playable && stream.url
        ? stream
        : (!resolving && urlType !== "youtube" && videoUrl
            ? { playable: true, kind: classifyUrl(videoUrl), url: videoUrl, engine: "native" }
            : null);

  /* Single unified loading state: lecture data OR stream resolution pending */
  const showLoading = loading || (resolving && !resolvedStream);

  /* ---- Full-page player with optional PDF sidebar ---- */
  if (playerOnly) {
    if (showLoading) {
      return (
        <main className="fixed inset-0 flex items-center justify-center bg-black">
          <div className="flex flex-col items-center gap-3 text-white/75">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs">Loading lecture…</span>
          </div>
        </main>
      );
    }
    return (
      <main className="fixed inset-0 flex min-h-0 min-w-0 bg-black">
        {/* Video side */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-3 sm:px-5 bg-gradient-to-b from-black/70 to-transparent">
            <button onClick={back} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer transition-colors" aria-label="Close player">
              <ChevronLeft size={18} />
            </button>
            {title && <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{title}</p>}
            {videoId && (
              <button onClick={toggleBookmark} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer transition-colors" aria-label={bookmarkSet ? "Remove bookmark" : "Bookmark"}>
                {bookmarkSet ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
            )}
          </div>
          <div className="relative flex min-h-0 flex-1 w-full items-center justify-center bg-black">
            <NativePlayerCore
              stream={resolvedStream}
              title={title}
              notes={notes}
              onPosition={handlePosition}
              onOpenNote={openNote}
              fullPage
              batchId={batchId}
            />
          </div>
        </div>
        {/* PDF sidebar */}
        {pdfPanel && (
          <aside className="w-full max-w-[420px] shrink-0 border-l border-border bg-surface lg:flex lg:flex-col hidden">
            <PdfPanel url={pdfPanel.url} title={pdfPanel.name} onClose={() => setPdfPanel(null)} />
          </aside>
        )}
      </main>
    );
  }

  /* ---- Embedded player with optional PDF sidebar ---- */
  if (showLoading) {
    return (
      <main className="flex-1 w-full px-3 sm:px-5">
        <div className="mx-auto max-w-7xl pt-6 space-y-4">
          <div className="aspect-video max-w-4xl rounded-2xl bg-muted animate-pulse" />
          <div className="h-8 w-2/3 max-w-xl rounded-lg bg-muted animate-pulse" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full px-3 pb-20 sm:px-5 md:pb-8">
      <div className="mx-auto max-w-[1400px] pt-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <GlassButton variant="secondary" size="sm" onClick={back} className="shrink-0">
            <ChevronLeft size={15} /> Back to chapter
          </GlassButton>
        </div>
        <div className={cn(
          "grid gap-5",
          pdfPanel
            ? "lg:grid-cols-[1fr_400px]"
            : "grid-cols-1 xl:grid-cols-[1fr_360px]"
        )}>
          <div className="space-y-4 min-w-0">
            <NativePlayerCore
              stream={resolvedStream}
              title={title}
              notes={notes}
              onPosition={handlePosition}
              onOpenNote={openNote}
              batchId={batchId}
            />
            <LectureMetaCard title={title} appState={appState} batchId={batchId} navigate={navigate} bookmarkSet={bookmarkSet} onBookmark={toggleBookmark} />
          </div>
          <aside className="min-w-0">
            {pdfPanel ? (
              <div className="h-[70vh] rounded-2xl overflow-hidden border border-border shadow-xl">
                <PdfPanel url={pdfPanel.url} title={pdfPanel.name} onClose={() => setPdfPanel(null)} />
              </div>
            ) : (
              <PlaylistCard playlist={playlist} contentId={contentId} onOpen={(p) => navigate({ view: "watch", batchId, subjectSlug, topicId, contentId: p.id, lectureTitle: p.title })} />
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

/* ===========================================================================
 *  NativePlayerCore — the actual player (HLS / DASH / MP4 / YouTube)
 * =========================================================================*/

function NativePlayerCore({
  stream,
  title,
  notes,
  onPosition,
  onOpenNote,
  fullPage = false,
  batchId,
}: {
  stream: StreamResolution | null;
  title: string;
  notes?: NoteDoc[];
  onPosition?: (seconds: number) => void;
  onOpenNote?: (url: string, name: string) => void;
  fullPage?: boolean;
  batchId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  const [quality, setQuality] = useState("auto");
  const qualityControlRef = useRef<((id: string) => void) | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fallbackStream, setFallbackStream] = useState<StreamResolution | null>(null);

  const speedRef = useRef(speed);
  const positionRef = useRef(onPosition);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  const isYouTube = stream?.kind === "youtube";

  useEffect(() => { speedRef.current = speed; positionRef.current = onPosition; }, [speed, onPosition]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const stillPlaying = isYouTube
        ? ytPlayerRef.current?.getPlayerState() === 1
        : !videoRef.current?.paused;
      if (stillPlaying) setShowControls(false);
    }, 3000);
  }, [isYouTube]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (ytTickRef.current) clearInterval(ytTickRef.current);
    };
  }, []);

  /* ---- attach engine (HLS / DASH / MP4 / YouTube) ---- */
  const streamKey = stream?.url ?? "";
  const streamKind = stream?.kind ?? "unknown";
  const streamFolder = stream?.folder;
  const streamClearKey = stream?.clearKey;
  const streamClearKid = stream?.clearKid;
  const fallback = fallbackStream ?? stream;

  useEffect(() => {
    if (!fallback) return;
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
    setQualities([]);
    setQuality("auto");
    qualityControlRef.current = null;

    let destroyed = false;
    let dispose: (() => void) | undefined;
    let managedStream = false;

    const fail = (msg: string) => { if (!destroyed) { setError(msg); setLoading(false); } };
    const failDash = () => {
      if (destroyed) return;
      if (fallback.kind === "dash" && fallback.folder) {
        setFallbackStream({ ...fallback, kind: "hls", engine: "hls", url: `/api/hls/${encodeURIComponent(fallback.folder)}/master.m3u8`, reason: undefined });
        return;
      }
      fail("The stream could not be loaded. Please retry.");
    };

    /* --- YouTube branch --- */
    if (fallback.kind === "youtube") {
      setLoading(true);
      loadYouTubeAPI().then(() => {
        if (destroyed || !ytHostRef.current || !window.YT) return;
        const player = new window.YT.Player(ytHostRef.current, {
          videoId: fallback.url,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3 },
          events: {
            onReady: (e) => {
              if (destroyed) return;
              ytPlayerRef.current = e.target;
              setDuration(e.target.getDuration() || 0);
              setLoading(false);
              ytTickRef.current = setInterval(() => {
                if (destroyed || !ytPlayerRef.current) return;
                const t = ytPlayerRef.current.getCurrentTime();
                const d = ytPlayerRef.current.getDuration();
                setCurrent(t);
                if (d) setDuration(d);
                positionRef.current?.(t);
                setBuffered(d > 0 ? (t / d) * 100 : 0);
              }, 500);
            },
            onStateChange: (e) => {
              if (destroyed) return;
              const S = window.YT!.PlayerState;
              if (e.data === S.PLAYING) { setPlaying(true); setLoading(false); }
              else if (e.data === S.PAUSED) setPlaying(false);
              else if (e.data === S.BUFFERING) setLoading(true);
              else if (e.data === S.ENDED) setPlaying(false);
              else if (e.data === S.CUED) { setLoading(false); setDuration(e.target.getDuration() || 0); }
            },
            onError: () => {
              if (destroyed) return;
              setError("This YouTube video could not be loaded. It may be private or restricted.");
              setLoading(false);
            },
          },
        });
      });
      return () => {
        destroyed = true;
        if (ytTickRef.current) { clearInterval(ytTickRef.current); ytTickRef.current = null; }
        try { ytPlayerRef.current?.destroy(); } catch { /* ignore */ }
        ytPlayerRef.current = null;
      };
    }

    /* --- Native <video> branch (HLS / DASH / MP4) --- */
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => { if (!destroyed) { setDuration(Number.isFinite(video.duration) ? video.duration : 0); setLoading(false); setError(null); video.playbackRate = speedRef.current; } };
    const handleTime = () => {
      if (destroyed) return;
      setCurrent(video.currentTime);
      if (video.buffered.length) { try { setBuffered(video.buffered.end(video.buffered.length - 1)); } catch { /* ignore */ } }
      positionRef.current?.(video.currentTime);
    };
    const handlePlay = () => !destroyed && setPlaying(true);
    const handlePause = () => !destroyed && setPlaying(false);
    const handleErr = () => {
      if (managedStream || destroyed) return;
      const code = video.error?.code;
      fail(code === 2 ? "The video could not be downloaded. Check your connection and retry."
        : code === 3 ? "This browser could not decode the video. Please retry."
        : "The video source is unavailable or unsupported. Please retry.");
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleErr);

    (async () => {
      try {
        if (fallback.kind === "hls") {
          const Hls = (await import("hls.js")).default;
          if (destroyed) return;
          if (Hls.isSupported()) {
            managedStream = true;
            const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
            dispose = () => hls.destroy();
            qualityControlRef.current = (id) => { hls.nextLevel = id === "auto" ? -1 : Number(id); };
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (destroyed) return;
              setQualities(hls.levels.map((level, index) => ({ id: String(index), label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps` })));
            });
            let networkRetries = 0; let mediaRetries = 0;
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (destroyed || !data.fatal) return;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries++ < 2) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 2) hls.recoverMediaError();
              else failDash();
            });
            hls.loadSource(fallback.url);
            hls.attachMedia(video);
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = fallback.url; video.load();
          } else { fail("HLS is not supported in this browser."); }
        } else if (fallback.kind === "dash") {
          const { MediaPlayer } = await import("dashjs");
          if (destroyed) return;
          managedStream = true;
          const player = MediaPlayer().create();
          dispose = () => player.reset();
          player.on(MediaPlayer.events.ERROR, () => failDash());
          qualityControlRef.current = (id) => {
            player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: id === "auto" } } } });
            if (id !== "auto") player.setRepresentationForTypeById("video", id);
          };
          player.on(MediaPlayer.events.STREAM_INITIALIZED, () => {
            if (destroyed) return;
            setQualities(player.getRepresentationsByType("video").map((rep) => ({ id: rep.id, label: rep.height ? `${rep.height}p` : `${Math.round(rep.bitrateInKbit)} kbps` })));
          });
          if (fallback.clearKey && fallback.clearKid) {
            player.setProtectionData({ "org.w3.clearkey": { clearkeys: { [fallback.clearKid]: fallback.clearKey } } });
          }
          player.initialize(video, fallback.url, false);
        } else {
          video.src = fallback.url; video.load();
        }
      } catch { failDash(); }
    })();

    return () => {
      destroyed = true;
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleErr);
      qualityControlRef.current = null;
      dispose?.();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [streamKey, streamKind, streamFolder, streamClearKey, streamClearKid, attempt, fallback]);

  /* ---- fullscreen tracking ---- */
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = useCallback(() => {
    if (isYouTube) {
      const p = ytPlayerRef.current; if (!p) return;
      if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo();
    } else {
      const v = videoRef.current; if (!v) return;
      if (v.paused) { void v.play().catch((cause: unknown) => { if (cause instanceof DOMException && cause.name === "AbortError") return; setError("Playback could not start. Please retry."); setLoading(false); }); }
      else v.pause();
    }
  }, [isYouTube]);

  const toggleMute = useCallback(() => {
    if (isYouTube) {
      const p = ytPlayerRef.current; if (!p) return;
      if (p.isMuted()) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); }
    } else {
      const v = videoRef.current; if (!v) return;
      v.muted = !v.muted; setMuted(v.muted);
    }
  }, [isYouTube]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current; if (!el) return;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); }
    else if (el.requestFullscreen) { void el.requestFullscreen().catch(() => {}); }
    else { const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null; video?.webkitEnterFullscreen?.(); }
  }, []);

  const changeSpeed = useCallback((s: number) => {
    if (isYouTube) { const p = ytPlayerRef.current; if (!p) return; p.setPlaybackRate(s); }
    else { const v = videoRef.current; if (!v) return; v.playbackRate = s; }
    setSpeed(s); setShowSpeed(false);
  }, [isYouTube]);

  const skip = useCallback((offset: number) => {
    if (isYouTube) {
      const p = ytPlayerRef.current; if (!p) return;
      const t = p.getCurrentTime(); const d = p.getDuration();
      const next = Math.min(d, Math.max(0, t + offset));
      p.seekTo(next, true); setCurrent(next);
    } else {
      const video = videoRef.current; if (!video || video.readyState === 0) return;
      const start = video.seekable.length ? video.seekable.start(0) : 0;
      const end = Number.isFinite(video.duration) ? video.duration : video.seekable.length ? video.seekable.end(video.seekable.length - 1) : video.currentTime;
      const next = Math.min(end, Math.max(start, video.currentTime + offset));
      video.currentTime = next; setCurrent(next);
    }
  }, [isYouTube]);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); revealControls(); break;
        case "ArrowLeft": skip(-5); revealControls(); break;
        case "ArrowRight": skip(5); revealControls(); break;
        case "j": skip(-10); revealControls(); break;
        case "l": skip(10); revealControls(); break;
        case "m": toggleMute(); revealControls(); break;
        case "f": toggleFullscreen(); break;
        case "ArrowUp": if (!isYouTube) { e.preventDefault(); const v = videoRef.current; if (v && v.volume < 1) v.volume = Math.min(1, v.volume + 0.1); } revealControls(); break;
        case "ArrowDown": if (!isYouTube) { e.preventDefault(); const v = videoRef.current; if (v && v.volume > 0) v.volume = Math.max(0, v.volume - 0.1); } revealControls(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleMute, toggleFullscreen, skip, revealControls, isYouTube]);

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  /* ---- seek bar ---- */
  const seekFromPosition = (clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    if (isYouTube) { ytPlayerRef.current?.seekTo(t, true); }
    else { const v = videoRef.current; if (v) v.currentTime = t; }
    setCurrent(t);
  };

  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsScrubbing(true); setShowControls(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromPosition(e.clientX);
  };
  const onSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => { if (isScrubbing) seekFromPosition(e.clientX); };
  const onSeekPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return; setIsScrubbing(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    seekFromPosition(e.clientX);
  };

  if (!fallback) {
    return (
      <div className={cn("flex items-center justify-center bg-black", fullPage ? "w-full h-full" : "aspect-video w-full rounded-2xl border border-border")}>
        <div className="px-6 text-center">
          <p className="text-sm text-muted-foreground">{stream?.reason ?? "No stream available for this lecture."}</p>
        </div>
      </div>
    );
  }

  const progressPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = isYouTube
    ? (buffered > 0 ? Math.min(100, buffered) : 0)
    : (duration > 0 && buffered > 0 ? Math.min(100, (buffered / duration) * 100) : 0);

  const containerClass = fullPage
    ? "sb-native-player relative w-full h-full min-w-0 min-h-0 bg-black overflow-hidden select-none group"
    : "sb-native-player relative w-full min-w-0 bg-black rounded-2xl overflow-hidden border border-border select-none group";

  return (
    <div ref={containerRef} className={containerClass} onMouseMove={revealControls} onMouseLeave={() => playing && setShowControls(false)}>
      {/* Video element — YouTube uses a div host, others use <video> */}
      {isYouTube ? (
        <div className={cn("w-full bg-black pointer-events-none", fullPage ? "h-full max-h-full" : "aspect-video")}>
          <div ref={ytHostRef} className="w-full h-full" />
        </div>
      ) : (
        <video ref={videoRef} className={cn("sb-native-video w-full object-contain bg-black", fullPage ? "h-full max-h-full" : "aspect-video")} playsInline />
      )}

      {/* Double-click seek zones */}
      <button type="button" aria-label="Rewind 15 seconds" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); skip(-15); revealControls(); }} className="absolute left-0 top-1/4 z-10 h-1/2 w-1/3 cursor-pointer" />
      <button type="button" aria-label="Forward 15 seconds" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); skip(15); revealControls(); }} className="absolute right-0 top-1/4 z-10 h-1/2 w-1/3 cursor-pointer" />

      {/* Center play/pause button */}
      <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => { togglePlay(); revealControls(); }} className={cn("absolute left-1/2 top-1/2 z-20 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full", !playing && !loading && !error ? "bg-white/15 text-white backdrop-blur-md" : "bg-transparent text-transparent")}>
        {!playing && !loading && !error && <Play size={30} className="ml-1" />}
      </button>

      {/* Loading spinner */}
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 size={36} className="text-primary animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 px-6 text-center">
          <p role="alert" className="max-w-md text-sm text-foreground">{error}</p>
          <button type="button" onClick={() => setAttempt((v) => v + 1)} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground cursor-pointer transition hover:brightness-110">Retry playback</button>
        </div>
      )}

      {/* Attachments toggle */}
      {notes && notes.length > 0 && !error && (
        <button onClick={() => { setShowAttachments((s) => !s); revealControls(); }} className={cn("absolute z-[45] flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-black/70 cursor-pointer", showControls ? "opacity-100" : "opacity-0 pointer-events-none", showAttachments ? "bg-primary" : "bg-black/50 hover:bg-black/70", fullPage ? "top-14 right-3 sm:top-4 sm:right-4" : "top-3 right-3")}>
          <Paperclip size={14} /> Attachments <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{notes.length}</span>
        </button>
      )}

      {/* Attachments drawer */}
      {showAttachments && notes && notes.length > 0 && (
        <>
          <div className="absolute inset-0 z-[35] bg-black/45" onClick={() => setShowAttachments(false)} />
          <div className={cn("absolute z-[40] bottom-0 right-0 top-0 w-[min(88vw,380px)] rounded-l-2xl bg-surface border-l border-border shadow-2xl overflow-hidden", fullPage ? "pt-16 sm:pt-5" : "pt-5")}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="flex items-center gap-2 text-sm font-bold text-foreground"><Paperclip size={15} className="text-primary" /> Attachments</span>
              <button onClick={() => setShowAttachments(false)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X size={15} /></button>
            </div>
            <div className="max-h-60 overflow-y-auto sb-scroll">
              {notes.map((n) => (
                <div key={n.id} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted border-b border-border last:border-0">
                  <button onClick={() => { onOpenNote?.(n.url, n.name); setShowAttachments(false); }} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-primary"><Paperclip size={14} /></span>
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground line-clamp-1">{n.name}</span>
                  </button>
                  <DownloadButton contentId={n.id} batchId={batchId ?? ""} lectureTitle={n.name} kind="pdf" url={n.url} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ---- Mobile controls ---- */}
      {!error && (
        <div className={cn("absolute left-0 right-0 bottom-0 z-20 transition-opacity duration-300 md:hidden", showControls ? "opacity-100" : "opacity-0 pointer-events-none")}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />
          <div className="relative px-3 pb-3 pt-8">
            <div ref={seekBarRef} className="group/seek relative h-6 flex items-center cursor-pointer touch-none" onPointerDown={onSeekPointerDown} onPointerMove={onSeekPointerMove} onPointerUp={onSeekPointerUp} role="slider" aria-label="Seek" aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(duration)} tabIndex={0}>
              <div className="relative h-1 w-full rounded-full bg-white/25 overflow-hidden">
                {bufferedPct > 0 && <div className="absolute top-0 left-0 h-full bg-white/35" style={{ width: `${bufferedPct}%` }} />}
                <div className="absolute top-0 left-0 h-full bg-red-600 rounded-full" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-red-600 shadow-md transition-transform group-active/seek:scale-125" style={{ left: `${progressPct}%` }} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] tabular-nums text-white/90">{fmt(current)}</span>
              <span className="text-[11px] tabular-nums text-white/50">/ {fmt(duration)}</span>
              <span className="ml-2 min-w-0 flex-1 truncate text-[11px] text-white/60">{title}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button onClick={() => { skip(-10); revealControls(); }} disabled={loading} aria-label="Rewind 10 seconds" className="relative flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/15 cursor-pointer disabled:opacity-40"><RotateCcw size={26} /><span className="absolute text-[8px] font-bold mt-0.5">10</span></button>
                <button onClick={() => { togglePlay(); revealControls(); }} className="flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/15 cursor-pointer" aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}</button>
                <button onClick={() => { skip(10); revealControls(); }} disabled={loading} aria-label="Forward 10 seconds" className="relative flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/15 cursor-pointer disabled:opacity-40"><RotateCw size={26} /><span className="absolute text-[8px] font-bold mt-0.5">10</span></button>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { toggleMute(); revealControls(); }} className="flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/15 cursor-pointer" aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
                <div className="relative">
                  <button onClick={() => { setShowSpeed((s) => !s); setShowSettings(false); revealControls(); }} className="flex h-12 min-w-12 items-center justify-center gap-1 rounded-full px-2 text-white active:bg-white/15 cursor-pointer" aria-label="Playback speed"><Gauge size={18} /><span className="text-[11px] font-bold">{speed}x</span></button>
                  {showSpeed && (
                    <div className="absolute bottom-full mb-2 right-0 rounded-xl bg-surface border border-border shadow-2xl py-1 min-w-[120px]">
                      {SPEEDS.map((s) => <button key={s} onClick={() => { changeSpeed(s); revealControls(); }} className={cn("w-full px-4 py-2.5 text-left text-xs font-semibold transition-colors hover:bg-muted cursor-pointer", s === speed ? "text-primary" : "text-foreground")}>{s}x{s === 1 && " (Normal)"}</button>)}
                    </div>
                  )}
                </div>
                {qualities.length > 0 && (
                  <div className="relative">
                    <button onClick={() => { setShowSettings((s) => !s); setShowSpeed(false); revealControls(); }} className="flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/15 cursor-pointer" aria-label="Quality settings"><Settings size={18} /></button>
                    {showSettings && (
                      <div className="absolute bottom-full mb-2 right-0 rounded-xl bg-surface border border-border shadow-2xl py-1 min-w-[120px]">
                        <button onClick={() => { qualityControlRef.current?.("auto"); setQuality("auto"); setShowSettings(false); revealControls(); }} className={cn("w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-muted cursor-pointer", quality === "auto" ? "text-primary" : "text-foreground")}>Auto</button>
                        {qualities.map((opt) => <button key={opt.id} onClick={() => { qualityControlRef.current?.(opt.id); setQuality(opt.id); setShowSettings(false); revealControls(); }} className={cn("w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-muted cursor-pointer", quality === opt.id ? "text-primary" : "text-foreground")}>{opt.label}</button>)}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={toggleFullscreen} className="flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/15 cursor-pointer" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Desktop controls ---- */}
      {!error && (
        <div className={cn("absolute left-0 right-0 bottom-0 z-20 hidden px-4 pb-3 pt-8 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-200 md:block", showControls ? "opacity-100" : "opacity-0 pointer-events-none")}>
          <div ref={seekBarRef} className="group/seek relative mb-2 flex items-center gap-2" role="slider" aria-label="Seek" aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(duration)} tabIndex={0}>
            <span className="text-[11px] tabular-nums text-white/90 w-12 text-right">{fmt(current)}</span>
            <div className="relative flex-1 h-4 cursor-pointer flex items-center" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); seekFromPosition(e.clientX + rect.left - rect.left); }}>
              <div className="relative h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                {bufferedPct > 0 && <div className="absolute top-0 left-0 h-full bg-white/35" style={{ width: `${bufferedPct}%` }} />}
                <div className="absolute top-0 left-0 h-full bg-red-600 rounded-full" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-red-600 shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" style={{ left: `${progressPct}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-white/90 w-12">{fmt(duration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { togglePlay(); revealControls(); }} className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10 cursor-pointer" aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <button onClick={() => { skip(-10); revealControls(); }} disabled={loading} className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10 cursor-pointer disabled:opacity-40" aria-label="Rewind 10 seconds"><RotateCcw size={22} /><span className="absolute text-[8px] font-bold">10</span></button>
            <button onClick={() => { skip(10); revealControls(); }} disabled={loading} className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10 cursor-pointer disabled:opacity-40" aria-label="Forward 10 seconds"><RotateCw size={22} /><span className="absolute text-[8px] font-bold">10</span></button>
            <button onClick={() => { toggleMute(); revealControls(); }} className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10 cursor-pointer" aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
            <div className="relative">
              <button onClick={() => { setShowSpeed((s) => !s); setShowSettings(false); revealControls(); }} className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[11px] font-bold text-white/90 hover:bg-white/20 cursor-pointer" aria-label="Playback speed"><Gauge size={13} /> {speed}x</button>
              {showSpeed && (
                <div className="absolute bottom-full mb-2 left-0 rounded-xl bg-surface border border-border shadow-2xl py-1 min-w-[110px]">
                  {SPEEDS.map((s) => <button key={s} onClick={() => { changeSpeed(s); revealControls(); }} className={cn("w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted cursor-pointer", s === speed ? "text-primary" : "text-foreground")}>{s}x{s === 1 && " (Normal)"}</button>)}
                </div>
              )}
            </div>
            {qualities.length > 0 && (
              <div className="relative">
                <button onClick={() => { setShowSettings((s) => !s); setShowSpeed(false); revealControls(); }} className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[11px] font-bold text-white/90 hover:bg-white/20 cursor-pointer" aria-label="Quality"><Settings size={13} /> {qualities.find((q) => q.id === quality)?.label ?? "Auto"}</button>
                {showSettings && (
                  <div className="absolute bottom-full mb-2 left-0 rounded-xl bg-surface border border-border shadow-2xl py-1 min-w-[120px]">
                    <button onClick={() => { qualityControlRef.current?.("auto"); setQuality("auto"); setShowSettings(false); revealControls(); }} className={cn("w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted cursor-pointer", quality === "auto" ? "text-primary" : "text-foreground")}>Auto</button>
                    {qualities.map((opt) => <button key={opt.id} onClick={() => { qualityControlRef.current?.(opt.id); setQuality(opt.id); setShowSettings(false); revealControls(); }} className={cn("w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted cursor-pointer", quality === opt.id ? "text-primary" : "text-foreground")}>{opt.label}</button>)}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1" />
            <span className="text-[11px] font-medium text-white/60 line-clamp-1 max-w-[40%]">{title}</span>
            <button onClick={toggleFullscreen} className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10 cursor-pointer" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
 *  Helper cards (lecture meta + playlist)
 * =========================================================================*/

function LectureMetaCard({ title, appState, batchId, navigate, bookmarkSet, onBookmark }: {
  title: string;
  appState: ReturnType<typeof useApp.getState>;
  batchId: string;
  navigate: ReturnType<typeof useApp.getState>["navigate"];
  bookmarkSet: boolean;
  onBookmark: () => void;
}) {
  return (
    <GlassCard hover={false} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight leading-snug">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {appState.batchName && (
              <button className="cursor-pointer" onClick={() => navigate({ view: "batch", batchId })}>
                <GlassBadge tone="primary">{appState.batchName}</GlassBadge>
              </button>
            )}
            {appState.subjectName && <GlassBadge>{appState.subjectName}</GlassBadge>}
            {appState.topicName && <GlassBadge>{appState.topicName}</GlassBadge>}
          </div>
        </div>
        <GlassButton variant={bookmarkSet ? "primary" : "secondary"} onClick={onBookmark}>
          {bookmarkSet ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          {bookmarkSet ? "Saved" : "Save"}
        </GlassButton>
      </div>
    </GlassCard>
  );
}

function PlaylistCard({ playlist, contentId, onOpen }: {
  playlist: PlaylistLecture[];
  contentId: string;
  onOpen: (p: PlaylistLecture) => void;
}) {
  return (
    <GlassCard hover={false} className="overflow-hidden xl:sticky xl:top-24">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <ListVideo size={17} className="text-primary" />
        <h2 className="font-bold text-sm">Chapter Playlist</h2>
        <span className="ml-auto text-xs text-muted-foreground">{playlist.length}</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto sb-scroll">
        {playlist.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">Playlist unavailable for this chapter.</p>
        ) : (
          playlist.map((p, i) => (
            <button key={p.id} onClick={() => onOpen(p)} className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-b border-border last:border-0", p.id === contentId ? "bg-accent-soft" : "hover:bg-muted")}>
              <span className={cn("text-[11px] font-bold w-5 shrink-0", p.id === contentId ? "text-primary" : "text-muted-foreground")}>{i + 1}</span>
              <span className="relative w-20 aspect-video rounded-lg overflow-hidden shrink-0 border border-border">
                <SafeImage src={p.thumbnail} alt="" className="w-full h-full object-cover" />
              </span>
              <span className={cn("min-w-0 flex-1 text-[13px] leading-snug line-clamp-2 font-medium", p.id === contentId && "text-primary")}>{p.title}</span>
            </button>
          ))
        )}
      </div>
    </GlassCard>
  );
}

/* ===========================================================================
 *  Utilities
 * =========================================================================*/

function classifyUrl(url: string): StreamResolution["kind"] {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".m3u8")) return "hls";
  if (clean.endsWith(".mpd")) return "dash";
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return "mp4";
  return "hls";
}

function prettify(slug: string): string {
  return slug.split("-").slice(0, -1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
