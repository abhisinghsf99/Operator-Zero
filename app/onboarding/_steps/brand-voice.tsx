"use client";

/**
 * app/onboarding/_steps/brand-voice.tsx
 * Step 3: Brand voice bootstrap conversation.
 *
 * Drives a 3-5 turn scoped conversation via the SSE streaming route
 * with only ask_user_clarification + record_memory_item tools.
 * On completion, saves a brand_voice_profiles row before proceeding.
 *
 * Full implementation in Task 2 (02-08 Plan).
 */
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveBrandVoiceProfile } from "@/app/onboarding/actions";

const PROMPTS = [
  {
    id: "writing",
    question: "Show me a piece of writing you're proud of. A product description, an email, anything.",
    placeholder: "Paste a paragraph or two…",
  },
  {
    id: "customer",
    question: "Who's your customer, in one sentence?",
    placeholder: 'e.g. "people who care about how things are made"…',
  },
  {
    id: "avoid",
    question: "What's a phrase you'd never use?",
    placeholder: 'e.g. "luxury", "crafted with passion"…',
  },
];

interface BrandVoiceStepProps {
  onNext: () => void;
}

export function BrandVoiceStep({ onNext }: BrandVoiceStepProps) {
  const [promptIndex, setPromptIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = promptIndex >= PROMPTS.length;
  const current = PROMPTS[promptIndex];

  function handleNext() {
    if (!currentAnswer.trim()) return;

    const newAnswers = { ...answers, [current!.id]: currentAnswer };
    setAnswers(newAnswers);
    setCurrentAnswer("");
    setPromptIndex(promptIndex + 1);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const result = await saveBrandVoiceProfile(answers);

    if (result && "error" in result) {
      setError(result.error);
      setSaving(false);
      return;
    }

    onNext();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          Brand voice · {Math.min(promptIndex + 1, PROMPTS.length)} of {PROMPTS.length}
        </div>
        <h2 className="display mt-2 text-[36px] leading-tight tracking-[-0.015em] text-[var(--text)]">
          {isDone ? "Got it. Let me build your voice." : "What's your brand?"}
        </h2>
      </div>

      {/* Answered prompts */}
      {Object.entries(answers).map(([id, answer]) => {
        const prompt = PROMPTS.find(p => p.id === id);
        return (
          <div key={id} className="rounded-[var(--r-md)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] p-4">
            <div className="mb-1.5 text-[12px] text-[var(--text-tertiary)]">{prompt?.question}</div>
            <div className="text-[13.5px] text-[var(--text)]">{answer}</div>
          </div>
        );
      })}

      {/* Current prompt */}
      {!isDone && current && (
        <div className="flex flex-col gap-3">
          <label
            htmlFor="brand-voice-answer"
            className="text-[15px] font-medium text-[var(--text)]"
          >
            {current.question}
          </label>
          <textarea
            id="brand-voice-answer"
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder={current.placeholder}
            rows={3}
            className="w-full resize-none rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-workflow)]"
          />
          <div className="flex justify-end">
            <Button
              variant="workflow"
              onClick={handleNext}
              disabled={!currentAnswer.trim()}
            >
              {promptIndex < PROMPTS.length - 1 ? "Next question" : "That's it"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Save step */}
      {isDone && (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] leading-[1.55] text-[var(--text-secondary)]">
            I'll use these answers to shape how I write for your store. You can always update your brand voice in Settings.
          </p>
          {error && (
            <p className="text-[13px] text-[var(--danger)]" role="alert">{error}</p>
          )}
          <div className="flex justify-end">
            <Button
              variant="workflow"
              size="lg"
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Build my voice profile"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
