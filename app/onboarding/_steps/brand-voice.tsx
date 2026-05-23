"use client";

/**
 * app/onboarding/_steps/brand-voice.tsx
 * Step 3: Brand voice bootstrap conversation.
 *
 * Chat-style 3-question conversation. Each answer is shown as a user bubble
 * after submission. On completion shows a drafted voice profile card before
 * proceeding.
 *
 * Full implementation in Task 2 (02-08 Plan).
 */
import { useState, useRef, useEffect } from "react";
import { Button, Avatar, Card } from "@/components/design/primitives";
import { Icons } from "@/components/design/icons";
import { saveBrandVoiceProfile } from "@/app/onboarding/actions";

const PROMPTS = [
  {
    id: "writing",
    question:
      "Show me a piece of writing you're proud of. A product description, an email, anything.",
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = promptIndex >= PROMPTS.length;
  const current = PROMPTS[promptIndex];

  function handleSubmit(value: string) {
    const newAnswers = { ...answers, [PROMPTS[promptIndex]!.id]: value };
    setAnswers(newAnswers);
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
    <div className="anim-pop" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Brand voice · 3 quick questions
        </div>
        <h2
          className="display"
          style={{
            fontSize: 36,
            margin: "8px 0 6px",
            color: "var(--text)",
            letterSpacing: "-0.015em",
          }}
        >
          {isDone ? "Got it." : "How do you sound when you sound like you?"}
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          {isDone
            ? "I’ve drafted a voice profile from your answers. You can refine it anytime in Settings."
            : "I’ll use this to draft copy that reads like yours, not like an AI’s. You’ll see the profile before we save it."}
        </p>
      </div>

      {/* Chat-style conversation */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Answered prompts */}
        {PROMPTS.slice(0, promptIndex).map((p) => (
          <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Agent question */}
            <div style={{ display: "flex", gap: 10 }}>
              <Avatar agent size={24} />
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--text)",
                  lineHeight: 1.5,
                  paddingTop: 2,
                }}
              >
                {p.question}
              </div>
            </div>
            {/* User answer bubble */}
            <div
              style={{
                alignSelf: "flex-end",
                maxWidth: "80%",
                padding: "10px 14px",
                background: "var(--bg-deeper)",
                borderRadius: "var(--r-lg)",
                borderBottomRightRadius: "var(--r-xs)",
                fontSize: 13.5,
                color: "var(--text)",
              }}
            >
              {answers[p.id]}
            </div>
          </div>
        ))}

        {/* Current prompt */}
        {!isDone && current && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Agent question */}
            <div style={{ display: "flex", gap: 10 }}>
              <Avatar agent size={24} />
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--text)",
                  lineHeight: 1.5,
                  paddingTop: 2,
                }}
              >
                {current.question}
              </div>
            </div>
            {/* Answer input */}
            <VoiceAnswerInput
              placeholder={current.placeholder}
              onSubmit={handleSubmit}
            />
          </div>
        )}

        {/* Drafted voice profile shown after all answers */}
        {isDone && (
          <Card padding={18}>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Drafted voice profile
            </div>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
              }}
            >
              {buildVoiceProfile(answers)}
            </div>
          </Card>
        )}
      </div>

      {/* Error */}
      {error && (
        <p style={{ fontSize: 13, color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      {/* Continue after all answers */}
      {isDone && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            accent="workflow"
            icon="ArrowRight"
            onClick={handleSave}
            disabled={saving}
            aria-label={saving ? "Saving brand voice profile" : undefined}
          >
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Build a short readable profile preview from the Q&A answers. */
function buildVoiceProfile(answers: Record<string, string>): string {
  const lines: string[] = [];
  if (answers["writing"]) {
    lines.push(`Based on your writing:\n${answers["writing"]}`);
  }
  if (answers["customer"]) {
    lines.push(`Your customer: ${answers["customer"]}`);
  }
  if (answers["avoid"]) {
    lines.push(`Phrases to avoid: ${answers["avoid"]}`);
  }
  return lines.join("\n\n");
}

/** Auto-focusing textarea + Send button — chat-style answer input. */
function VoiceAnswerInput({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
    }
  }

  return (
    <div
      style={{
        padding: "10px 14px",
        background: "var(--bg-elevated)",
        border: "0.5px solid var(--border-strong)",
        borderRadius: "var(--r-lg)",
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        rows={2}
        aria-label="Your answer"
        style={{
          all: "unset",
          flex: 1,
          padding: "4px 0",
          fontSize: 14,
          lineHeight: 1.55,
          minHeight: 28,
          fontFamily: "inherit",
          color: "var(--text)",
          resize: "none",
        } as React.CSSProperties}
      />
      <Button
        variant="primary"
        accent="chat"
        size="sm"
        icon="ArrowUp"
        disabled={!value.trim()}
        onClick={() => value.trim() && onSubmit(value.trim())}
        aria-label="Send answer"
      >
        Send
      </Button>
    </div>
  );
}
