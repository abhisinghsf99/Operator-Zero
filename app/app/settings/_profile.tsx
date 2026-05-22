"use client";

/**
 * app/app/settings/_profile.tsx
 * Profile section — display name, email, password, avatar.
 *
 * SET-05: Sarah can edit her display name, email, password, and avatar.
 *
 * Each subsection has its own submit handler with useTransition, Zod-error display
 * via aria-describedby, and aria-busy on submit buttons.
 *
 * SECURITY:
 *   - updateEmail/updatePassword go via supabase.auth.updateUser (auth-layer enforced)
 *   - updateProfile (display_name/avatar_url) scoped to authenticated user's claims.sub
 *
 * WCAG 2.1 AA:
 *   - aria-labelledby on the section
 *   - aria-describedby for inline errors
 *   - role="alert" on error messages
 *   - aria-busy on submit buttons during transitions
 *   - focus-visible ring on all interactive elements
 */
import { useState, useTransition, useId } from "react";
import { Button } from "@/components/ui/button";
import { updateProfile, updateEmail, updatePassword } from "@/app/app/settings/actions";
import type { UserProfileRow } from "@/lib/auth/profile";

interface ProfileSectionProps {
  profile: UserProfileRow;
}

export function ProfileSection({ profile }: ProfileSectionProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-testid="profile-section"
      className="mt-8"
    >
      <div className="mb-5">
        <h2
          id={headingId}
          className="display text-[28px] tracking-[-0.015em] text-[var(--text)]"
        >
          Profile
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--text-tertiary)]">
          Your account details.
        </p>
      </div>

      <div className="rounded-[var(--r-lg)] border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]">
        {/* Avatar + Name + Avatar URL */}
        <ProfileDetailsForm profile={profile} />

        <div className="border-t-[0.5px] border-[var(--border)] px-[18px] py-[18px]">
          {/* Email change */}
          <EmailChangeForm />
        </div>

        <div className="border-t-[0.5px] border-[var(--border)] px-[18px] py-[18px]">
          {/* Password change */}
          <PasswordChangeForm />
        </div>
      </div>
    </section>
  );
}

// ─── Profile details (name + avatar) ─────────────────────────────────────────

function ProfileDetailsForm({ profile }: { profile: UserProfileRow }) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const nameId = useId();
  const avatarId = useId();
  const nameErrorId = useId();

  function handleSave() {
    startTransition(async () => {
      setError(null);
      setSuccess(false);
      const result = await updateProfile({
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <div className="px-[18px] py-[18px]">
      {/* Avatar preview */}
      <div className="mb-5 flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="Profile avatar"
            className="h-14 w-14 rounded-full object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[20px] text-[var(--text-secondary)]"
            aria-hidden="true"
          >
            {(displayName || "?")[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Paste an image URL below to update your avatar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Display name */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={nameId}
            className="font-mono text-[11.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]"
          >
            Name
          </label>
          <input
            id={nameId}
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSuccess(false);
            }}
            aria-describedby={error ? nameErrorId : undefined}
            placeholder="Your name"
            className="rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>

        {/* Avatar URL */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={avatarId}
            className="font-mono text-[11.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]"
          >
            Avatar URL
          </label>
          <input
            id={avatarId}
            type="url"
            value={avatarUrl}
            onChange={(e) => {
              setAvatarUrl(e.target.value);
              setSuccess(false);
            }}
            placeholder="https://…"
            className="rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {error && (
        <p
          id={nameErrorId}
          className="mt-3 text-[12.5px] text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-4">
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={isPending}
          aria-busy={isPending}
          data-testid="profile-save"
        >
          {isPending ? "Saving…" : success ? "Saved" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}

// ─── Email change ─────────────────────────────────────────────────────────────

function EmailChangeForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const emailId = useId();
  const emailErrorId = useId();

  function handleSave() {
    if (!email.trim()) return;
    startTransition(async () => {
      setError(null);
      setSuccess(false);
      const result = await updateEmail(email.trim());
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setEmail("");
    });
  }

  return (
    <div>
      <p className="mb-3 text-[13px] font-medium text-[var(--text)]">
        Change email
      </p>
      <p className="mb-3 text-[12.5px] text-[var(--text-tertiary)]">
        A confirmation link will be sent to the new address.
      </p>
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={emailId} className="sr-only">
            New email address
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSuccess(false);
            }}
            aria-describedby={error ? emailErrorId : undefined}
            placeholder="new@example.com"
            className="rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
          {error && (
            <p
              id={emailErrorId}
              className="text-[12px] text-[var(--danger)]"
              role="alert"
            >
              {error}
            </p>
          )}
          {success && (
            <p className="text-[12px] text-[var(--success)]" role="status">
              Confirmation email sent. Check your inbox.
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={isPending || !email.trim()}
          aria-busy={isPending}
          data-testid="profile-update-email"
          className="mt-0.5"
        >
          {isPending ? "Sending…" : "Update email"}
        </Button>
      </div>
    </div>
  );
}

// ─── Password change ──────────────────────────────────────────────────────────

function PasswordChangeForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const passwordId = useId();
  const confirmId = useId();
  const passwordErrorId = useId();

  function handleSave() {
    if (!password.trim()) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    startTransition(async () => {
      setError(null);
      setSuccess(false);
      const result = await updatePassword(password);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setPassword("");
      setConfirm("");
    });
  }

  return (
    <div>
      <p className="mb-3 text-[13px] font-medium text-[var(--text)]">
        Change password
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={passwordId}
            className="font-mono text-[11.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]"
          >
            New password
          </label>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setSuccess(false);
              setError(null);
            }}
            aria-describedby={error ? passwordErrorId : undefined}
            placeholder="Min 8 characters"
            className="rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={confirmId}
            className="font-mono text-[11.5px] uppercase tracking-[0.05em] text-[var(--text-tertiary)]"
          >
            Confirm password
          </label>
          <input
            id={confirmId}
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setSuccess(false);
              setError(null);
            }}
            placeholder="Repeat password"
            className="rounded-[var(--r-sm)] border-[0.5px] border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {error && (
        <p
          id={passwordErrorId}
          className="mt-2 text-[12px] text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="mt-2 text-[12px] text-[var(--success)]" role="status">
          Password updated successfully.
        </p>
      )}

      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={isPending || !password.trim() || !confirm.trim()}
          aria-busy={isPending}
          data-testid="profile-update-password"
        >
          {isPending ? "Updating…" : "Update password"}
        </Button>
      </div>
    </div>
  );
}
