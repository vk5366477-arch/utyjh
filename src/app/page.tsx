"use client";

import { useEffect } from "react";
import { useApp, bindRouter } from "@/lib/store";
import { SiteHeader } from "@/components/study-bison/header";
import { HomeView } from "@/components/study-bison/home-view";
import { BatchesView } from "@/components/study-bison/batches-view";
import { EnrolledView } from "@/components/study-bison/enrolled-view";
import { BatchDetail } from "@/components/study-bison/batch-detail";
import { SubjectView } from "@/components/study-bison/subject-view";
import { TopicView } from "@/components/study-bison/topic-view";
import { WatchView } from "@/components/study-bison/native-player";
import { LeaderboardView } from "@/components/study-bison/leaderboard-view";
import { ProfileView } from "@/components/study-bison/profile-view";
import { PdfViewerView } from "@/components/study-bison/pdf-viewer";
import { AuthGate } from "@/components/study-bison/auth-gate";
import { TelegramPopup } from "@/components/study-bison/telegram-popup";

export default function Page() {
  const { view, batchId, subjectSlug, topicId, contentId } = useApp();

  useEffect(() => bindRouter(), []);

  useEffect(() => {
    const s = useApp.getState();
    const suffix = " · Quantica Digital";
    const titles: Record<string, string> = {
      home: `Today${suffix}`,
      batches: `Batches${suffix}`,
      enrolled: `My batches${suffix}`,
      batch: `${s.batchName ?? "Batch"}${suffix}`,
      subject: `${s.subjectName ?? "Subject"}${suffix}`,
      topic: `${s.topicName ?? "Chapter"}${suffix}`,
      watch: `${s.lectureTitle ?? "Lecture"}${suffix}`,
      leaderboard: `Leaderboard${suffix}`,
      profile: `Profile${suffix}`,
      pdf: `${s.lectureTitle ?? "PDF"}${suffix}`,
    };
    document.title = titles[view] ?? `Quantica Digital`;
  }, [view]);

  const playerOnlyView = view === "watch" || view === "pdf";

  if (playerOnlyView) {
    return (
      <AuthGate>
        <TelegramPopup />
        {view === "pdf" ? (
          <PdfViewerView />
        ) : view === "watch" && batchId && subjectSlug && contentId ? (
          <WatchView
            key={`${batchId}:${subjectSlug}:${contentId}`}
            batchId={batchId}
            subjectSlug={subjectSlug}
            topicId={topicId}
            contentId={contentId}
            playerOnly
          />
        ) : null}
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <TelegramPopup />
      <div className="flex min-h-screen w-full min-w-0 flex-col">
        <SiteHeader />
        <div className="min-w-0 flex-1 pb-20 md:pb-0">
          {view === "leaderboard" ? (
            <LeaderboardView />
          ) : view === "profile" ? (
            <ProfileView />
          ) : view === "batches" ? (
            <BatchesView />
          ) : view === "enrolled" ? (
            <EnrolledView />
          ) : view === "batch" && batchId ? (
            <BatchDetail key={batchId} batchId={batchId} />
          ) : view === "subject" && batchId && subjectSlug ? (
            <SubjectView key={`${batchId}:${subjectSlug}`} batchId={batchId} subjectSlug={subjectSlug} />
          ) : view === "topic" && batchId && subjectSlug && topicId ? (
            <TopicView
              key={`${batchId}:${subjectSlug}:${topicId}`}
              batchId={batchId}
              subjectSlug={subjectSlug}
              topicId={topicId}
            />
          ) : (
            <HomeView />
          )}
        </div>
      </div>
    </AuthGate>
  );
}
