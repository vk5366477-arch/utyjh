"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, CheckCircle2, XCircle, RefreshCw, X, Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PracticeQuestion {
  q: string;
  options: string[];
  answer: number;
  userAnswer: number | null;
}

interface PdfNote {
  id: string;
  name: string;
  url: string;
}

interface PracticeModeProps {
  contentId: string;
  batchId: string;
  notes: PdfNote[];
  onClose: () => void;
}

function generateQuestions(notes: PdfNote[]): PracticeQuestion[] {
  // Generate fill-in-the-blank style questions from note names and keywords
  const questions: PracticeQuestion[] = [];

  for (const note of notes.slice(0, 3)) {
    const name = note.name.replace(/\.(pdf|PDF)$/, "");
    const words = name.split(/[\s\-_]+/).filter((w) => w.length > 3);

    if (words.length >= 2) {
      const blankWord = words[Math.floor(Math.random() * words.length)];
      const question = name.replace(new RegExp(blankWord, "i"), "_____");
      const distractors = words
        .filter((w) => w !== blankWord)
        .slice(0, 3)
        .map((w) => w);
      while (distractors.length < 3) {
        const filler = ["concept", "theory", "method", "formula", "principle"][distractors.length] ?? "term";
        distractors.push(filler);
      }
      const options = [...distractors, blankWord].sort(() => Math.random() - 0.5);
      const answer = options.indexOf(blankWord);
      if (answer >= 0 && question !== name) {
        questions.push({ q: `Fill in the blank: ${question}`, options, answer, userAnswer: null });
      }
    }

    // True/False from filename
    if (questions.length < 5) {
      const statements = [
        { text: `This document covers: ${name}`, correct: true },
        { text: `This document is about a completely unrelated topic.`, correct: false },
      ];
      const pick = statements[Math.floor(Math.random() * statements.length)];
      questions.push({
        q: `True or False: ${pick.text}`,
        options: ["True", "False"],
        answer: pick.correct ? 0 : 1,
        userAnswer: null,
      });
    }
  }

  // If we couldn't generate enough from notes, add general study questions
  while (questions.length < 5) {
    const generic = [
      { q: "Reviewing notes after watching a lecture improves retention by up to:", options: ["20%", "50%", "80%", "100%"], answer: 2 },
      { q: "The best time to review lecture notes is:", options: ["Within 24 hours", "After a week", "Before the exam only", "Never"], answer: 0 },
      { q: "Active recall is more effective than:", options: ["Passive re-reading", "Sleeping", "Exercise", "Eating"], answer: 0 },
      { q: "Spaced repetition works best when intervals:", options: ["Stay constant", "Gradually increase", "Decrease over time", "Are random"], answer: 1 },
      { q: "Taking practice tests before an exam:", options: ["Wastes time", "Reduces anxiety and improves scores", "Has no effect", "Harms performance"], answer: 1 },
    ];
    const idx = questions.length % generic.length;
    questions.push({ ...generic[idx], userAnswer: null });
  }

  return questions.slice(0, 8);
}

export function PracticeMode({ contentId, batchId, notes, onClose }: PracticeModeProps) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pastScore, setPastScore] = useState<number | null>(null);
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    setQuestions(generateQuestions(notes));
    setGenerating(false);
  }, [notes]);

  useEffect(() => {
    fetch(`/api/practice?contentId=${encodeURIComponent(contentId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.items?.[0]) setPastScore(d.items[0].score);
      })
      .catch(() => {});
  }, [contentId]);

  const current = questions[currentIdx];

  const selectAnswer = (idx: number) => {
    if (submitted) return;
    setQuestions((prev) => prev.map((q, i) => i === currentIdx ? { ...q, userAnswer: idx } : q));
  };

  const next = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setSubmitted(false);
    } else {
      // Calculate score
      const score = questions.filter((q) => q.userAnswer === q.answer).length;
      fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, batchId, questions, score, total: questions.length }),
      }).catch(() => {});
      setShowResult(true);
    }
  };

  const restart = () => {
    setQuestions(generateQuestions(notes));
    setCurrentIdx(0);
    setShowResult(false);
    setSubmitted(false);
  };

  if (generating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-primary" size={28} />
        <p className="text-xs text-muted-foreground">Generating quiz...</p>
      </div>
    );
  }

  if (showResult) {
    const score = questions.filter((q) => q.userAnswer === q.answer).length;
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Results</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer"><X size={15} /></button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className={cn(
            "flex h-24 w-24 items-center justify-center rounded-full text-2xl font-extrabold",
            pct >= 70 ? "bg-green-500/15 text-green-400" : pct >= 40 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"
          )}>
            {pct}%
          </div>
          <p className="text-center text-sm text-foreground">
            You got <span className="font-bold">{score}</span> out of <span className="font-bold">{questions.length}</span> correct
          </p>
          {pastScore !== null && (
            <p className="text-center text-xs text-muted-foreground">
              Previous best: {pastScore} / {questions.length}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={restart} className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 transition cursor-pointer">
              <RefreshCw size={13} /> Try again
            </button>
            <button onClick={onClose} className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition cursor-pointer">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
        <Brain size={15} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">Practice Quiz</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {currentIdx + 1} / {questions.length}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer"><X size={15} /></button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted shrink-0">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }} />
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto sb-scroll px-4 py-4 min-h-0">
        <p className="text-sm font-semibold text-foreground leading-relaxed mb-4">{current?.q}</p>
        <div className="space-y-2">
          {current?.options.map((opt, i) => {
            const isSelected = current.userAnswer === i;
            const isCorrect = i === current.answer;
            const showState = submitted && (isSelected || isCorrect);
            return (
              <button
                key={i}
                onClick={() => selectAnswer(i)}
                disabled={submitted}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all cursor-pointer",
                  !submitted && isSelected && "border-primary bg-accent-soft",
                  !submitted && !isSelected && "border-border hover:border-primary/40 hover:bg-muted/50",
                  submitted && isCorrect && "border-green-500/50 bg-green-500/10",
                  submitted && isSelected && !isCorrect && "border-red-500/50 bg-red-500/10",
                  submitted && !isSelected && !isCorrect && "border-border opacity-60",
                )}
              >
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  !submitted && isSelected && "bg-primary text-primary-foreground",
                  !submitted && !isSelected && "bg-muted text-muted-foreground",
                  submitted && isCorrect && "bg-green-500 text-white",
                  submitted && isSelected && !isCorrect && "bg-red-500 text-white",
                  submitted && !isSelected && !isCorrect && "bg-muted text-muted-foreground",
                )}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 flex-1 text-foreground">{opt}</span>
                {submitted && isCorrect && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
                {submitted && isSelected && !isCorrect && <XCircle size={16} className="text-red-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 shrink-0 flex items-center justify-between">
        {submitted ? (
          <button
            onClick={next}
            className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 transition cursor-pointer"
          >
            {currentIdx < questions.length - 1 ? "Next question" : "See results"}
          </button>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              {current?.userAnswer !== null ? "Ready to check" : "Select an answer"}
            </span>
            <button
              onClick={() => setSubmitted(true)}
              disabled={current?.userAnswer === null}
              className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 transition disabled:opacity-40 cursor-pointer"
            >
              Check answer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
