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
import { Avatar, Button, Card } from "@/components/design/primitives";
import { updateProfile, updateEmail, updatePassword } from "@/app/app/settings/actions";
import type { UserProfileRow } from "@/lib/auth/profile";

interface ProfileSectionProps {
  profile: UserProfileRow;
}

// Shared input style matching the design's Input helper
const inputStyle = {
  all: "unset" as "unset",
  display: "block" as "block",
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg-subtle)",
  border: "0.5px solid var(--border)",
  borderRadius: "var(--r-sm)",
  fontSize: 13.5,
  color: "var(--text)",
  boxSizing: "border-box" as "border-box",
};

const labelStyle = {
  fontSize: 11.5,
  fontFamily: "var(--font-mono)",
  color: "var(--text-tertiary)",
  textTransform: "uppercase" as "uppercase",
  letterSpacing: "0.05em",
};

export function ProfileSection({ profile }: ProfileSectionProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-testid="profile-section"
    >
      {/* SectionTitle — matches design SectionTitle helper */}
      <div style={{ marginBottom: 22 }}>
        <h2
          id={headingId}
          className="display"
          style={{ fontSize: 28, color: "var(--text)", margin: 0, letterSpacing: "-0.015em" }}
        >
          Profile
        </h2>
        <p style={{ margin: "4px 0 0", color: "var(--text-tertiary)", fontSize: 13.5, lineHeight: 1.5 }}>
          Your account details.
        </p>
      </div>

      <Card padding={24}>
        {/* Avatar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt="Profile avatar"
              style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }}
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <Avatar
              name={profile.display_name ?? "?"}
              size={56}
            />
          )}
          <div>
            <Button variant="secondary" size="sm">Upload photo</Button>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>
              PNG or JPG, up to 2MB.
            </div>
          </div>
        </div>

        {/* Profile details form */}
        <ProfileDetailsForm profile={profile} />

        {/* Divider */}
        <div style={{ borderTop: "0.5px solid var(--border-hairline)", margin: "22px 0 18px" }} />

        {/* Email change */}
        <EmailChangeForm />

        {/* Divider */}
        <div style={{ borderTop: "0.5px solid var(--border-hairline)", margin: "18px 0" }} />

        {/* Password change */}
        <PasswordSection profile={profile} />
      </Card>
    </section>
  );
}

// ─── Profile details (name + avatar URL) ─────────────────────────────────────

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
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Display name */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={nameId} style={labelStyle}>Name</label>
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
            style={inputStyle}
            className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>

        {/* Avatar URL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={avatarId} style={labelStyle}>Avatar URL</label>
          <input
            id={avatarId}
            type="url"
            value={avatarUrl}
            onChange={(e) => {
              setAvatarUrl(e.target.value);
              setSuccess(false);
            }}
            placeholder="https://…"
            style={inputStyle}
            className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {error && (
        <p
          id={nameErrorId}
          style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--success)" }} role="status">
          Profile saved.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <Button
          variant="primary"
          accent="chat"
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
      <p style={{ marginBottom: 12, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
        Change email
      </p>
      <p style={{ marginBottom: 12, fontSize: 12.5, color: "var(--text-tertiary)" }}>
        A confirmation link will be sent to the new address.
      </p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={emailId} className="sr-only">New email address</label>
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
            style={inputStyle}
            className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
          {error && (
            <p
              id={emailErrorId}
              style={{ fontSize: 12, color: "var(--danger)" }}
              role="alert"
            >
              {error}
            </p>
          )}
          {success && (
            <p style={{ fontSize: 12, color: "var(--success)" }} role="status">
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
          style={{ marginTop: 2 }}
        >
          {isPending ? "Sending…" : "Update email"}
        </Button>
      </div>
    </div>
  );
}

// ─── Password section ─────────────────────────────────────────────────────────

function PasswordSection({ profile: _ }: { profile: UserProfileRow }) {
  return (
    <div>
      <p style={{ marginBottom: 12, fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
        Change password
      </p>
      <PasswordChangeForm />
    </div>
  );
}

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={passwordId} style={labelStyle}>New password</label>
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
            style={inputStyle}
            className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={confirmId} style={labelStyle}>Confirm password</label>
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
            style={inputStyle}
            className="focus-visible:ring-2 focus-visible:ring-[var(--acc-workflow)] focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {error && (
        <p
          id={passwordErrorId}
          style={{ marginTop: 8, fontSize: 12, color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--success)" }} role="status">
          Password updated successfully.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <Button
          variant="secondary"
          size="sm"
          icon="Lock"
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
