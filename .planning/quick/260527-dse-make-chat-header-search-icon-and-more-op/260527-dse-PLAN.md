---
phase: quick-260527-dse
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/0010_threads_pinned_at.sql
  - lib/db/schema/threads.ts
  - app/app/chat/actions.ts
  - components/chat/thread-sidebar.tsx
  - components/design/icons.tsx
  - components/chat/chat-header-menu.tsx
  - components/chat/chat-search-bar.tsx
  - components/chat/message-stream.tsx
  - app/app/chat/[threadId]/page.tsx
autonomous: true
requirements: [QUICK-260527-dse]

must_haves:
  truths:
    - "The Search IconButton in the chat header toggles an in-thread search bar that filters messages and scrolls matches into view"
    - "The More (⋯) IconButton opens a keyboard-operable custom popover with Rename, Delete, Copy transcript, and Pin/Unpin"
    - "Renaming a thread updates the header title and persists via the existing renameThread action"
    - "Deleting a thread soft-deletes it (archived_at = now()) and navigates away"
    - "Copy transcript copies a role-labeled markdown transcript to the clipboard with a toast confirmation"
    - "Pinning a thread sorts it to the top of the sidebar and shows a pin indicator"
    - "tsc --noEmit is clean and no new runtime dependency is added"
  artifacts:
    - path: "supabase/migrations/0010_threads_pinned_at.sql"
      provides: "Forward-only idempotent migration adding pinned_at to threads"
      contains: "ADD COLUMN IF NOT EXISTS \"pinned_at\""
    - path: "lib/db/schema/threads.ts"
      provides: "pinned_at column in Drizzle threads schema"
      contains: "pinned_at"
    - path: "app/app/chat/actions.ts"
      provides: "deleteThread + togglePinThread server actions; listThreads returns pinned_at"
      contains: "export async function deleteThread"
    - path: "components/chat/chat-header-menu.tsx"
      provides: "Custom accessible popover menu for the ⋯ button"
      min_lines: 60
    - path: "components/chat/chat-search-bar.tsx"
      provides: "In-thread search bar with match nav and aria-live"
      min_lines: 50
    - path: "components/chat/message-stream.tsx"
      provides: "Wired Search + More buttons, message ref map, highlight + scroll"
      contains: "onClick"
    - path: "components/chat/thread-sidebar.tsx"
      provides: "Pin indicator glyph on pinned rows"
      contains: "pinned_at"
  key_links:
    - from: "components/chat/message-stream.tsx"
      to: "components/chat/chat-header-menu.tsx"
      via: "onClick on More IconButton opens ChatHeaderMenu"
      pattern: "ChatHeaderMenu"
    - from: "components/chat/chat-header-menu.tsx"
      to: "app/app/chat/actions.ts"
      via: "deleteThread + togglePinThread + renameThread calls"
      pattern: "deleteThread|togglePinThread"
    - from: "app/app/chat/actions.ts"
      to: "lib/db/schema/threads.ts pinned_at"
      via: "withUserRls update of threads.pinned_at"
      pattern: "pinned_at"
    - from: "app/app/chat/[threadId]/page.tsx"
      to: "components/chat/message-stream.tsx"
      via: "initialPinnedAt prop derived from active thread in listThreads result"
      pattern: "initialPinnedAt"
---

<objective>
Make the two dead IconButtons in the Orchestrator chat header (Search and ⋯ More) fully functional. Wire an in-thread search bar (message-level matching, match nav, scroll-into-view + highlight) to the Search button, and a custom accessible popover with four actions — Rename, Delete (soft), Copy transcript, Pin/Unpin — to the ⋯ button.

Purpose: The header controls are currently no-ops, leaving thread management and in-conversation search inaccessible. This closes a visible gap on the primary product surface.
Output: New migration 0010 (pinned_at), schema + two new server actions (deleteThread, togglePinThread) mirroring renameThread, an extended listThreads, a pin indicator in the sidebar, and two new client components (popover menu, search bar) wired into the chat header.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Extracted from codebase. Use these directly — no exploration needed. -->

renameThread convention to mirror EXACTLY (app/app/chat/actions.ts):
```typescript
// 1. zod safeParse → return { error } on failure
// 2. const supabase = await createClient();
//    const { data } = await supabase.auth.getClaims();
//    const claims = data?.claims ?? null;
//    if (!claims?.sub) return { error: "unauthenticated" };
// 3. try { await withUserRls(claims as Record<string, unknown>, async (tx) => tx.update(threads).set({...}).where(eq(threads.id, id))); return { ok: true }; }
//    catch (err) { return { error: toClientError(err, "actionName") }; }
// Imports already present: eq, desc, isNull, and from drizzle-orm; z from zod; threads, withUserRls from @/lib/db; toClientError from @/lib/errors
```

ThreadListItem (app/app/chat/actions.ts) — extend with pinned_at:
```typescript
export type ThreadListItem = {
  id: string;
  title: string | null;
  last_message_at: Date | null;
  created_at: Date;
  // ADD: pinned_at: Date | null;
};
```

threads table (lib/db/schema/threads.ts): has archived_at timestamptz (nullable). RLS policy threads_user_policy is for: "all" → covers UPDATE. No new policy needed for pinned_at or archived_at.

ChatThreadView (components/chat/message-stream.tsx): holds `const [messages, setMessages] = useState<StreamMessage[]>`. Header IconButtons at ~lines 322-323 currently have NO onClick. StreamMessage has { id, role, content, status, ... }.

IconButton (components/design/primitives.tsx): supports `onClick`, `title`, `active` (renders aria-pressed + accent bg), `aria-label`.

Dialog (components/ui/dialog.tsx): Radix-backed. Exports Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose. @radix-ui/react-dialog IS installed — USE this for rename + delete-confirm UI.

toast (sonner): `import { toast } from "sonner";` — established pattern (see components/chat/composer.tsx). <Toaster /> already mounted in app/layout.tsx. Use toast.success(...) / toast.error(...).

Migration 0009 header style to mirror (supabase/migrations/0009_...sql): block comment with what/why, "Applied via: supabase db push over the session pooler (port 5432). Never use MCP apply_migration", "Forward-only. Idempotent.", and "HUMAN ACTION REQUIRED: apply before ..." notes.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration 0010 + pinned_at schema column</name>
  <files>supabase/migrations/0010_threads_pinned_at.sql, lib/db/schema/threads.ts</files>
  <action>
Create supabase/migrations/0010_threads_pinned_at.sql with a header comment block mirroring 0009's style: explain WHY (chat ⋯ menu Pin/Unpin needs a pinned_at sort key on threads), then the MANDATORY lines verbatim in spirit: "Applied via: supabase db push over the session pooler (port 5432). Never use MCP apply_migration — it lacks project-write permission for this project.", "Forward-only. Idempotent (ADD COLUMN IF NOT EXISTS).", and "HUMAN ACTION REQUIRED: apply before pin works in prod." The single statement is: ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "pinned_at" timestamptz;

In lib/db/schema/threads.ts add, alongside archived_at, a column: pinned_at: timestamp("pinned_at", { withTimezone: true }) with a one-line JSDoc ("Pin-to-top timestamp (nullable — pinned threads sort above the rest)"). Do NOT add a new index (planner discretion — skip it; idx_threads_user_last is sufficient for v1). Do NOT add a new RLS policy — threads_user_policy (for: all) already covers UPDATE of this column; note this in the schema comment.

This is a schema-only change — applying the migration to the live DB is OUT OF SCOPE (separate human/CLI step per the migration header).
  </action>
  <verify>
    <automated>test -f supabase/migrations/0010_threads_pinned_at.sql && grep -q 'ADD COLUMN IF NOT EXISTS "pinned_at"' supabase/migrations/0010_threads_pinned_at.sql && grep -q "Never use MCP apply_migration" supabase/migrations/0010_threads_pinned_at.sql && grep -q "HUMAN ACTION REQUIRED" supabase/migrations/0010_threads_pinned_at.sql && grep -q 'pinned_at' lib/db/schema/threads.ts && echo OK</automated>
  </verify>
  <done>Migration 0010 file exists with the idempotent pinned_at ALTER and the mandatory header notes; threads schema declares pinned_at as a nullable withTimezone timestamp.</done>
</task>

<task type="auto">
  <name>Task 2: deleteThread + togglePinThread server actions; extend listThreads</name>
  <files>app/app/chat/actions.ts</files>
  <action>
Add two new server actions to app/app/chat/actions.ts, each mirroring renameThread EXACTLY (zod safeParse with a uuid threadId schema; createClient → getClaims → claims?.sub guard returning { error: "unauthenticated" }; withUserRls update scoped by eq(threads.id, threadId); try/catch returning { ok: true } | { error: toClientError(err, "<name>") }).

(a) deleteThread(threadId: string): Promise<{ ok: true } | { error: string }> — SOFT delete only: .set({ archived_at: new Date() }). NEVER hard-delete. Add deleteThreadSchema = z.object({ threadId: z.string().uuid(...) }).

(b) togglePinThread(threadId: string): Promise<{ ok: true; pinned: boolean } | { error: string }> — read current pinned_at first (select threads.pinned_at where eq(threads.id, threadId) inside the same withUserRls tx), then set pinned_at to null if currently set, else new Date(). Return { ok: true, pinned } where pinned reflects the NEW state (true if just pinned). Add togglePinThreadSchema with uuid threadId. Do the read-then-write inside a single withUserRls callback.

Extend listThreads: add pinned_at: threads.pinned_at to the .select({...}); change ordering to pinned-first then recency. Use Drizzle sql for NULLS LAST: import sql from "drizzle-orm" and order by sql`${threads.pinned_at} DESC NULLS LAST`, desc(threads.last_message_at). Add pinned_at: Date | null to the ThreadListItem type.

Keep all existing actions (createThread, openWorkflowInChat, renameThread, saveWorkflowFromPlan, listMessages) untouched.
  </action>
  <verify>
    <automated>grep -q "export async function deleteThread" app/app/chat/actions.ts && grep -q "export async function togglePinThread" app/app/chat/actions.ts && grep -A30 "export async function deleteThread" app/app/chat/actions.ts | grep -q "withUserRls" && grep -A30 "export async function togglePinThread" app/app/chat/actions.ts | grep -q "withUserRls" && grep -A30 "export async function deleteThread" app/app/chat/actions.ts | grep -q "archived_at" && grep -q "pinned_at: threads.pinned_at" app/app/chat/actions.ts && grep -q "NULLS LAST" app/app/chat/actions.ts && npx tsc --noEmit && echo OK</automated>
  </verify>
  <done>deleteThread (soft-delete via archived_at) and togglePinThread (flips pinned_at) exist, both use withUserRls + getClaims + zod + toClientError; listThreads selects pinned_at, orders pinned-first (NULLS LAST), and ThreadListItem includes pinned_at; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Pin icon + sidebar pin indicator</name>
  <files>components/design/icons.tsx, components/chat/thread-sidebar.tsx</files>
  <action>
In components/design/icons.tsx add a Pin icon to the Icons map following the existing Icon wrapper pattern (1.5px stroke, currentColor, 24x24 viewBox). Use a simple pushpin/pin path, e.g. a slanted pin: a line tail plus a pin head — keep it a single visually-clear glyph consistent with the line-icon set. (Search and More icons already exist — do not duplicate.)

In components/chat/thread-sidebar.tsx: the threads are ALREADY ordered pinned-first by listThreads (Task 2), so no client re-sort is needed. Add a small pin indicator glyph on rows where thread.pinned_at != null: render <Icons.Pin size={11} style={{ color: "var(--text-tertiary)" }} aria-hidden /> inside the title row span (which already uses display:flex, gap:6), placed before or after the title text. Give pinned rows an aria-label or visually-hidden text so screen readers announce "pinned" (e.g. add a <span className="sr-only">Pinned</span> or set aria-label on the button including "pinned"). Do not change the row click behavior. ThreadListItem now includes pinned_at (from Task 2) so it is available on each thread.
  </action>
  <verify>
    <automated>grep -q "Pin:" components/design/icons.tsx && grep -q "pinned_at" components/chat/thread-sidebar.tsx && grep -q "Icons.Pin" components/chat/thread-sidebar.tsx && npx tsc --noEmit && echo OK</automated>
  </verify>
  <done>Icons.Pin exists; sidebar renders a pin glyph on pinned rows with a screen-reader-accessible "pinned" cue; pinned ordering already handled by listThreads.</done>
</task>

<task type="auto">
  <name>Task 4: ChatHeaderMenu — custom accessible popover (Rename / Delete / Copy / Pin)</name>
  <files>components/chat/chat-header-menu.tsx</files>
  <action>
Create a new client component components/chat/chat-header-menu.tsx exporting ChatHeaderMenu. It owns the ⋯ popover and the rename/delete dialogs. Props:
  threadId: string;
  threadTitle: string;
  pinned: boolean;
  messages: Array<{ role: "user" | "assistant"; content: string }>;  // for transcript export
  onRenamed: (newTitle: string) => void;   // lets header update its title state
  onPinnedChange: (pinned: boolean) => void; // lets header update menu label + pin state

Render an IconButton (icon="More", title="More options", aria-haspopup="menu", aria-expanded) that toggles an absolute-positioned popover (role="menu") anchored to the button. The component wraps the button + popover in a position:relative container.

POPOVER A11Y (WCAG 2.1 AA — mandatory):
- Open on click; close on outside click (document mousedown listener checking containerRef), on Escape, and after an item activates.
- On open, move focus to the first menu item; restore focus to the ⋯ button on close.
- Arrow Up/Down move focus between items (role="menuitem", tabIndex managed); Home/End optional. Enter/Space activate.
- Respect reduced motion: no entrance animation, or guard any transition with prefers-reduced-motion.
- Use design tokens for styling (var(--bg-elevated), var(--border), var(--r-md), var(--shadow-md), var(--text), var(--text-secondary)) so it matches the chat surface.

FOUR MENU ITEMS:
(a) Rename — opens a Dialog (from components/ui/dialog.tsx) containing a controlled text input pre-filled with threadTitle, a Cancel and a Save button. On Save call renameThread(threadId, value); on { ok: true } call onRenamed(value), toast.success("Thread renamed"), close dialog; on { error } toast.error(error). Trim + require non-empty before submit.
(b) Delete — opens a confirm Dialog ("Delete this conversation? It will be removed from your list."). On confirm call deleteThread(threadId); on success toast.success then router.push("/app/chat") (useRouter from next/navigation). On error toast.error.
(c) Copy transcript — build a role-labeled markdown string from messages in order (e.g. "**You:**\n<content>\n\n**Orchestrator:**\n<content>"). Call navigator.clipboard.writeText(transcript); on success toast.success("Transcript copied"). Guard: if navigator.clipboard is unavailable, toast.error with a graceful message (no throw). Close popover.
(d) Pin/Unpin — label is "Unpin" when pinned else "Pin to top". On click call togglePinThread(threadId); on { ok: true, pinned } call onPinnedChange(pinned) and toast.success(pinned ? "Pinned to top" : "Unpinned"); on error toast.error. Close popover.

Import renameThread, deleteThread, togglePinThread from "@/app/app/chat/actions". Mark "use client". Do NOT add any npm dependency — the popover is hand-rolled; the dialogs reuse the existing Radix-backed components/ui/dialog.tsx.
  </action>
  <verify>
    <automated>test -f components/chat/chat-header-menu.tsx && grep -q "ChatHeaderMenu" components/chat/chat-header-menu.tsx && grep -q "deleteThread" components/chat/chat-header-menu.tsx && grep -q "togglePinThread" components/chat/chat-header-menu.tsx && grep -q "renameThread" components/chat/chat-header-menu.tsx && grep -q 'role="menu"' components/chat/chat-header-menu.tsx && grep -q "clipboard" components/chat/chat-header-menu.tsx && grep -q "Escape" components/chat/chat-header-menu.tsx && npx tsc --noEmit && echo OK</automated>
  </verify>
  <done>ChatHeaderMenu renders an accessible role=menu popover (outside-click + Escape close, focus management, arrow-key nav) with working Rename (dialog → renameThread), Delete (confirm dialog → soft deleteThread → navigate away), Copy transcript (clipboard + toast, graceful fallback), and Pin/Unpin (togglePinThread + toast); no new dependency added; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 5: ChatSearchBar — in-thread message search</name>
  <files>components/chat/chat-search-bar.tsx</files>
  <action>
Create a new client component components/chat/chat-search-bar.tsx exporting ChatSearchBar. Props:
  messages: Array<{ id: string; content: string }>;
  onActiveMatchChange: (messageId: string | null) => void;  // header scrolls/highlights this message
  onClose: () => void;

Render a controlled search input row (rendered under the header by the parent). As the query changes, compute matches = messages whose content includes the query case-insensitively (MESSAGE-LEVEL only — do NOT attempt substring highlighting inside markdown). Track activeIndex into the matches array.

Behavior:
- Show "N/M" count (current match / total) next to prev/next chevron buttons (use Icons.ChevronUp / Icons.ChevronDown). Prev/Next wrap around.
- Whenever activeIndex or matches change, call onActiveMatchChange(matches[activeIndex]?.id ?? null).
- Keyboard: Enter = next match, Shift+Enter = prev match, Escape = clear + onClose(). When query is empty, call onActiveMatchChange(null).
- A11Y: input has aria-label="Search this conversation"; a visually-hidden aria-live="polite" region announces the match count (e.g. "3 matches, showing 1"). Include an X/close button (Icons.X) with aria-label="Close search". Autofocus the input on mount.
- Styling: use design tokens (var(--bg-elevated), var(--border), var(--text), var(--r-sm)) to match the chat surface; reduced-motion safe.

Do NOT add any dependency. This component only computes match ids and reports the active one upward — the actual scroll + highlight happens in the parent (Task 6) via a ref map.
  </action>
  <verify>
    <automated>test -f components/chat/chat-search-bar.tsx && grep -q "ChatSearchBar" components/chat/chat-search-bar.tsx && grep -q "onActiveMatchChange" components/chat/chat-search-bar.tsx && grep -q "toLowerCase\|toLocaleLowerCase" components/chat/chat-search-bar.tsx && grep -q "aria-live" components/chat/chat-search-bar.tsx && grep -q "Escape" components/chat/chat-search-bar.tsx && npx tsc --noEmit && echo OK</automated>
  </verify>
  <done>ChatSearchBar renders an accessible controlled search input with match count, prev/next nav (wrap-around), Enter/Shift+Enter/Escape keys, aria-live announcement, and reports the active match id upward via onActiveMatchChange; no dependency added; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 6: Wire Search + Menu into the chat header (message-stream.tsx + page loader)</name>
  <files>components/chat/message-stream.tsx, app/app/chat/[threadId]/page.tsx</files>
  <action>
PAGE LOADER (app/app/chat/[threadId]/page.tsx): listThreads now returns pinned_at per thread (Task 2). Derive the active thread's pinned_at and title from the already-loaded threads array (no extra query): const active = threads.find(t => t.id === threadId); pass into ChatThreadView two new props: initialPinnedAt={active?.pinned_at ?? null} and initialTitle={active?.title ?? null}.

MESSAGE-STREAM (components/chat/message-stream.tsx):
- Extend ChatThreadViewProps with optional initialPinnedAt?: Date | null and initialTitle?: string | null.
- Add header state: const [headerTitle, setHeaderTitle] = useState(initialTitle ?? "Orchestrator"); const [pinned, setPinned] = useState(initialPinnedAt != null); const [searchOpen, setSearchOpen] = useState(false); const [activeMatchId, setActiveMatchId] = useState<string | null>(null).
- Add a message ref map: const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map()). Pass a registration callback or ref setter into MessageBubble so each rendered bubble registers its outer container by message.id. Update MessageBubble to accept an optional `registerRef?: (id: string, el: HTMLDivElement | null) => void` and `highlighted?: boolean`, attach ref via callback, and when highlighted apply a temporary ring outline using var(--acc-chat-ink) (e.g. outline: 2px solid var(--acc-chat-ink); outlineOffset: 2px; borderRadius matches the bubble) — do NOT alter the ReactMarkdown block content (260527-d97 guardrail).
- Replace the dead <IconButton icon="Search" .../> with one that has onClick={() => setSearchOpen(v => !v)} and active={searchOpen}.
- Replace the dead <IconButton icon="More" .../> with <ChatHeaderMenu threadId={threadId} threadTitle={headerTitle} pinned={pinned} messages={messages.map(m => ({ role: m.role, content: m.content }))} onRenamed={(t) => setHeaderTitle(t)} onPinnedChange={setPinned} />.
- Render <ChatSearchBar> conditionally under the header when searchOpen, passing messages={messages.map(m => ({ id: m.id, content: m.content }))}, onActiveMatchChange={(id) => { setActiveMatchId(id); if (id) { const el = bubbleRefs.current.get(id); el?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" }); } }}, and onClose={() => { setSearchOpen(false); setActiveMatchId(null); }}.
- Use headerTitle in place of the hardcoded "Orchestrator" span so renames reflect live.
- Pass highlighted={message.id === activeMatchId} to each MessageBubble.
- Import ChatHeaderMenu and ChatSearchBar.

GUARDRAILS: Do NOT touch the SSE sendMessage logic, the Realtime subscription effect, the Composer, inline-block routing, or the ReactMarkdown components map. Only add header/search state, the ref map, and the two new components.
  </action>
  <verify>
    <automated>grep -q "ChatHeaderMenu" components/chat/message-stream.tsx && grep -q "ChatSearchBar" components/chat/message-stream.tsx && grep -q "setSearchOpen" components/chat/message-stream.tsx && grep -q "bubbleRefs" components/chat/message-stream.tsx && grep -q "scrollIntoView" components/chat/message-stream.tsx && grep -q "initialPinnedAt" components/chat/message-stream.tsx && grep -q "initialPinnedAt" "app/app/chat/[threadId]/page.tsx" && grep -q "ReactMarkdown" components/chat/message-stream.tsx && npx tsc --noEmit && echo OK</automated>
  </verify>
  <done>Both header IconButtons have onClick wiring: Search toggles ChatSearchBar (scroll + highlight active match via ref map), More renders ChatHeaderMenu; header title is live state updated on rename; pinned state seeded from initialPinnedAt passed by the loader; ReactMarkdown block untouched; SSE/Realtime/Composer untouched; tsc clean.</done>
</task>

</tasks>

<verification>
Phase-level checks (run after all tasks):

1. `npx tsc --noEmit` — clean, no type errors.
2. `git diff --stat package.json` — empty (NO new runtime dependency added).
3. `grep -q "export async function deleteThread" app/app/chat/actions.ts && grep -q "export async function togglePinThread" app/app/chat/actions.ts` — both new actions exist.
4. New actions use withUserRls: `grep -A30 "deleteThread\|togglePinThread" app/app/chat/actions.ts | grep -q withUserRls`.
5. `test -f supabase/migrations/0010_threads_pinned_at.sql && grep -q "pinned_at" supabase/migrations/0010_threads_pinned_at.sql` — migration present.
6. Sidebar orders pinned-first: `grep -q "NULLS LAST" app/app/chat/actions.ts` and sidebar shows indicator: `grep -q "Icons.Pin" components/chat/thread-sidebar.tsx`.
7. Header buttons wired: `grep -q "setSearchOpen" components/chat/message-stream.tsx && grep -q "ChatHeaderMenu" components/chat/message-stream.tsx`.
8. ReactMarkdown guardrail intact: `grep -q "ReactMarkdown" components/chat/message-stream.tsx` (markdown rendering not reverted).

NOTE: Applying migration 0010 to the live DB is OUT OF SCOPE — it is a separate human/CLI step (`supabase db push` over the session pooler, per the migration header). Pin/Unpin will not persist in prod until applied.
</verification>

<success_criteria>
- Search IconButton toggles an accessible in-thread search bar; typing filters messages, match count + prev/next work, selecting a match scrolls it into view and highlights it; Escape closes and clears.
- ⋯ IconButton opens a keyboard-operable custom popover with Rename, Delete, Copy transcript, Pin/Unpin — all functional.
- Rename persists via renameThread and updates the header title live.
- Delete soft-deletes (archived_at) and navigates away; no hard-delete.
- Copy transcript copies role-labeled markdown to clipboard with toast (graceful fallback).
- Pin/Unpin flips pinned_at; pinned threads sort to the top of the sidebar with a visible + screen-reader pin indicator.
- Migration 0010 file + pinned_at schema column exist (live-DB apply is a separate step).
- No new runtime dependency; `npx tsc --noEmit` clean; SSE/Realtime/Composer/markdown rendering untouched.
- WCAG 2.1 AA: popover and search are keyboard-operable with focus management, aria labels, aria-live, reduced-motion handling.
</success_criteria>

<output>
Create `.planning/quick/260527-dse-make-chat-header-search-icon-and-more-op/260527-dse-SUMMARY.md` when done.
</output>
