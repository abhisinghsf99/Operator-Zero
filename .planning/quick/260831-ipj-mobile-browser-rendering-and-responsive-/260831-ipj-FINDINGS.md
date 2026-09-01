# Quick Task 260831-ipj — Mobile Rendering Findings (empirically verified)

**Method:** Playwright + Chromium, `devices['iPhone 13']` (390×664 CSS px), driven against the
running dev server on `localhost:3000`. Authenticated via the public demo sandbox:
`/login` → click "Try the live demo →" → anonymous Supabase session → `/app/*`.

All findings below were **observed at runtime**, not inferred from reading source.

---

## F1 — Chat composer collapses to 36px wide (the reported bug)

**Runtime measurement** on `/app/chat/<threadId>`:

```json
{"rect":{"x":307,"y":390,"w":36,"h":140},"fontSize":"14px","whiteSpace":"normal","innerH":664}
```

The composer `<textarea>` is **36px wide**, pushed to x=307.

**Root cause:** `components/chat/thread-sidebar.tsx:74-80` renders

```jsx
<aside className={className} style={{ width: 260, display: "flex", ... }}>
```

`app/app/chat/[threadId]/page.tsx:59` passes `className="hidden md:flex"` intending to hide the
sidebar below `md`. **Inline styles beat Tailwind classes** — `style="display:flex"` overrides the
`hidden` (`display:none`) utility, so the sidebar renders at all breakpoints. On a 390px viewport
the sidebar eats 260px, leaving ~130px for the conversation pane; the composer's inner padding
reduces the textarea to 36px.

The existing source comment at `thread-sidebar.tsx:14-17` shows the author believed the class
gating worked. It never did.

**Note the two callers disagree and must both keep working:**
- `[threadId]/page.tsx:59` → `"hidden md:flex"` (hide on mobile — drill-down)
- `chat/page.tsx:47` → `"flex !w-full md:!w-[260px]"` (full-width on mobile — it IS the list)

The `!w-full` bang already fights the same inline-style precedence problem. Fix the root cause:
move `width`/`display` out of inline style into default classes so callers can override normally.

## F2 — Every surface heading breaks one word per line

`components/design/primitives.tsx:389` — `SurfaceHeader`:

```jsx
<div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:24 }}>
  <div style={{ ..., minWidth: 0 }}>   {/* title column — CAN shrink */}
  {right && <div style={{ display:"flex", ... }}>{right}</div>}  {/* actions — DON'T shrink */}
```

No `flexWrap`. The title column has `minWidth:0` so it absorbs all the shrinkage while the `right`
actions (search input + button) hold their intrinsic width. At 390px the title column collapses to
roughly its widest word.

**Observed:** `/app/workflows` renders "Your / workshop, / today." with the subtitle running
"A / portfolio / of / operations / your / agent / runs / for / you." — one word per line, and the
search box + "New workflow" button overlap the subtitle text.
`/app/approvals` shows the identical failure ("Things / waiting / for your / nod.").

Affects every surface using `SurfaceHeader`. Also `h1` is a hard `fontSize: 38`.

## F3 — `all: "unset"` breaks the composer textarea

`components/chat/composer.tsx:~322` sets `style={{ all: "unset", ... }}`.

`all: unset` resets `white-space` to its inherited/initial value. **Confirmed at runtime:**
`whiteSpace: "normal"` — the UA default for `<textarea>` is `pre-wrap`. Typed newlines stop
rendering as line breaks. It also resets `overflow`, which interacts with the
`scrollHeight`-based auto-resize effect at `composer.tsx:~186`.

`fontSize: 14` on the same element → see F4.

Wrapper padding is a hard-coded `"16px 32px 24px"` — 64px of horizontal padding on a 390px screen.

## F4 — iOS Safari zoom-on-focus: every input is under 16px

iOS Safari force-zooms the viewport when a focused `input`/`textarea`/`select` has a computed
`font-size` below 16px. Every text input in the app is 12–14px:

| File | Size |
|---|---|
| `components/ui/input.tsx:13` | `text-[13px]` |
| `components/chat/composer.tsx` | `fontSize: 14` |
| `components/chat/chat-search-bar.tsx:144` | `fontSize: 13` |
| `components/chat/chat-header-menu.tsx:364` | `fontSize: 13` |
| `components/workflows/workflow-search.tsx:77` | `fontSize: 13` |
| `app/app/settings/_profile.tsx:41` | `fontSize: 13.5` |
| `app/app/settings/_memory.tsx:271,459` | `fontSize: 13.5` |
| `app/app/settings/_brand-voice.tsx:155` | `fontSize: 12.5` |
| `app/app/approvals/_detail.tsx:391` | `fontSize: 12.5` |
| `app/app/approvals/_detail.tsx:578` | `text-[13px]` |
| `app/app/approvals/_inline-card.tsx:324` | `text-[12px]` (font-mono) |
| `app/app/approvals/_inline-card.tsx:437` | `text-[13px]` |
| `app/onboarding/_steps/brand-voice.tsx:283` | `fontSize: 14` |

Least invasive fix: one `@media (max-width: 768px)` rule in `app/globals.css` targeting
`input, textarea, select` with `font-size: 16px`. Inline `style` font sizes have higher precedence
than a stylesheet rule, so the rule needs `!important` to beat the many inline `fontSize` values —
or those inline values get moved to classes. Desktop rendering must stay untouched, hence the
`max-width: 768px` guard.

## F5 — Viewport height and safe area

`app/app/layout.tsx:36` — `className="flex flex-col h-screen overflow-hidden"`.

`h-screen` is `100vh`. On iOS Safari `100vh` is the *large* viewport (URL bar retracted), so with
`overflow-hidden` the bottom of the shell — the composer — sits under the browser chrome and
cannot be scrolled to. Needs `100dvh` with a `100vh` fallback for older browsers.

`app/app/layout.tsx:53` — `<main className="... pb-[56px] md:pb-0">`. The tab bar is
`position: fixed` with `min-h-[56px]` **plus** `pb-[env(safe-area-inset-bottom)]`
(`bottom-tabs.tsx:69`), so its real height on a notched iPhone is 56px + inset. The `pb-[56px]`
on main undercounts by exactly the inset, so content sits under the tab bar.

`bottom-tabs.tsx` already handles its own safe area correctly — do not double-apply it there.

Root layout (`app/layout.tsx`) exports no `viewport`. Next.js injects a default
`width=device-width, initial-scale=1`, which is fine, but there is no `viewport-fit=cover`.
`env(safe-area-inset-*)` resolves to 0 without `viewport-fit=cover` — so the existing safe-area
handling in `bottom-tabs.tsx` is currently inert on notched devices. Adding the `viewport` export
is required for any safe-area work to actually take effect.

## F6 — Hard-coded horizontal padding across surfaces

These eat a 390px viewport (values are inline `style`, so no breakpoint applies):

- `app/app/settings/_settings-shell.tsx:93` — `width: 240` nav sidebar; `:96` `"24px 16px"`;
  `:151` `"32px 48px 60px"` (96px horizontal)
- `app/app/workflows/[id]/_workflow-detail-view.tsx:139` `"20px 40px 0"`; `:167` `"16px 40px"`;
  `:210` `"32px 40px 60px"`; `:262` `"32px 28px 0"`; `:271` `"0 28px 32px"`
- `app/app/workflows/_workflows-view.tsx:207` — `"40px"` empty-state padding
- `app/app/activity/_activity-view.tsx:414` — `"10px 16px"`
- `components/chat/composer.tsx` — `"16px 32px 24px"` (see F3)

`SurfaceHeader` already does this correctly with `className="px-4 md:px-10"` — that is the
established in-repo pattern to follow.

---

## Baseline measurements (pre-fix)

`document.documentElement.scrollWidth` vs `clientWidth` at 390px — no horizontal overflow on any
surface (`390 === 390` on chat, approvals, activity, settings). The failure mode here is
**collapse and overlap**, not overflow, so a scrollWidth check alone will NOT catch these
regressions. Verification must assert element widths directly.

## Verification contract (must hold after the fix)

At `devices['iPhone 13']`, authenticated via the demo sandbox:

1. `/app/chat/<threadId>` — thread sidebar `display: none`; composer `<textarea>` width **> 250px**;
   computed `white-space` is `pre-wrap`.
2. All focusable `input`/`textarea` — computed `font-size` **>= 16px** at ≤768px width.
3. `SurfaceHeader` `<h1>` on `/app/workflows` and `/app/approvals` — bounding box width **> 250px**;
   header must not overlap its `right` actions.
4. `scrollWidth === clientWidth` on all 5 surfaces (no new horizontal overflow introduced).
5. **Desktop unchanged** — re-measure at `devices['Desktop Chrome']` (1280px) and confirm the
   sidebar is 260px, `SurfaceHeader` is a row, and padding values match pre-fix.
6. `npx playwright test tests/e2e/mobile.spec.ts --project=mobile-chrome` passes.

Existing e2e that must not regress: `tests/e2e/mobile.spec.ts`, `tests/e2e/a11y.spec.ts`,
`tests/e2e/keyboard.spec.ts`.
