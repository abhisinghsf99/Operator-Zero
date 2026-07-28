---
phase: quick-260526-mfp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [lib/demo/seed.ts]
autonomous: true
requirements: [SEED-GMAIL-MIRROR]

must_haves:
  truths:
    - "After demo reseed, the demo user has exactly 23 gmail_threads rows and 23 gmail_messages rows"
    - "Exactly 9 of those threads have is_customer_support = true (the 9 product questions)"
    - "gmail_list_threads returns the seeded threads ordered by last_message_at DESC instead of an empty inbox"
    - "gmail_get_thread joins the seeded message for any thread by gmail_thread_id"
    - "The approval-referenced threads gmail-thread-aa12 (maria.g@example.com) and gmail-thread-bb34 (devin.r@example.com) exist with matching from_address"
  artifacts:
    - path: "lib/demo/seed.ts"
      provides: "GMAIL MIRROR seed section (3.5) + WIPE deletes for gmail tables"
      contains: "gmailThreads"
  key_links:
    - from: "lib/demo/seed.ts (section 3.5)"
      to: "gmail_threads / gmail_messages tables"
      via: "tx.insert(gmailThreads) / tx.insert(gmailMessages) in the reseed transaction"
      pattern: "tx\\.insert\\(gmailThreads\\)"
    - from: "lib/agent/tools/read/index.ts (gmail_list_threads)"
      to: "seeded gmail_threads rows"
      via: "select filtered by user_id ordered by last_message_at"
      pattern: "gmail_thread"
---

<objective>
Seed the Gmail mirror tables (`gmail_threads`, `gmail_messages`) inside the demo
reseed so the Orchestrator's inbox tools (`gmail_list_threads`, `gmail_get_thread`)
return data consistent with the demo narrative instead of an empty inbox.

The chat seed (Thread C) tells the user there are "23 unread → 9 product questions,
6 order-status, 5 newsletter, 3 spam," and approvals §11 reference real thread IDs
(`gmail-thread-aa12` for Maria G., `gmail-thread-bb34` for Devin R.). Today those
threads do not exist in the mirror tables, so any inbox tool call returns nothing —
breaking the narrative. This plan adds the matching 23 threads/messages to the
single source of demo truth: `reseedDemo()`.

Purpose: Make the demo's inbox tools return data that matches what the chat and
approvals already claim, so the agent's inbox story holds up under inspection.
Output: Edited `lib/demo/seed.ts` (WIPE deletes + new section 3.5), live DB
populated and verified (23/23/9 counts).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- Drizzle schemas the executor inserts into. Use these directly. -->

From lib/db/schema/gmail-mirror.ts:
```typescript
// gmail_threads — composite PK (user_id, gmail_thread_id)
export const gmailThreads = pgTable("gmail_threads", {
  user_id: uuid("user_id").notNull(),
  gmail_thread_id: text("gmail_thread_id").notNull(),
  subject: text("subject"),
  participants: text("participants").array(),
  is_customer_support: boolean("is_customer_support").default(false),
  last_message_at: timestamp("last_message_at", { withTimezone: true }),
  message_count: integer("message_count"),
  last_synced_at: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
});

// gmail_messages — composite PK (user_id, gmail_message_id)
export const gmailMessages = pgTable("gmail_messages", {
  user_id: uuid("user_id").notNull(),
  gmail_message_id: text("gmail_message_id").notNull(),
  gmail_thread_id: text("gmail_thread_id").notNull(),
  from_address: text("from_address"),
  to_addresses: text("to_addresses").array(),
  subject: text("subject"),
  body_text: text("body_text"),
  body_html: text("body_html"),
  direction: text("direction"),   // 'inbound' | 'outbound' | 'draft'
  gmail_received_at: timestamp("gmail_received_at", { withTimezone: true }),
  last_synced_at: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Existing reseed conventions in lib/demo/seed.ts (follow these):
- `USER = process.env.DEMO_USER_ID` (string), guard returns early if unset.
- Time helper `MIN = (m) => new Date(now.getTime() - m * 60 * 1000)` already defined.
- WIPE section (1) deletes child→parent via `tx.delete(table).where(eq(table.user_id, USER))`.
- Section 3 INTEGRATIONS seeds the gmail integration with `last_synced_at: MIN(4)`.
- Data-driven loops use a typed tuple array iterated with `for (const [...] of arr)` —
  see MEMORY ITEMS (`mem`), SHOPIFY PRODUCTS (`products`), WORKFLOWS (`wfDefs`).
- Schema imports come from `@/lib/db/schema` (barrel); `eq` from `drizzle-orm`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Gmail mirror imports + WIPE deletes + section 3.5 seed loop</name>
  <files>lib/demo/seed.ts</files>
  <action>
Edit `lib/demo/seed.ts` only. Three changes:

1. IMPORT: Add `gmailThreads,` and `gmailMessages,` to the existing
   `from "@/lib/db/schema"` import block (the one ending in `messages,` near line 34).

2. WIPE (section 1): In the child→parent delete block, add two deletes near the
   `messages`/`threads` deletes (child before parent — messages before threads):
   - `await tx.delete(gmailMessages).where(eq(gmailMessages.user_id, USER));`
   - `await tx.delete(gmailThreads).where(eq(gmailThreads.user_id, USER));`
   These are leaf tables (no FK fan-out), so ordering relative to the chat
   `messages`/`threads` deletes is not strictly required, but keep gmailMessages
   before gmailThreads for consistency with the child→parent convention.

3. NEW SECTION 3.5: Insert immediately AFTER section "3. INTEGRATIONS" (after the
   gmail integration insert closes, before "4. BRAND VOICE"). Label it
   `// ─── 3.5 GMAIL MIRROR ───` matching the existing comment style.

   Make it data-driven over ONE typed tuple array — do NOT hand-write 23 insert
   blocks. Tuple type:
   `[gmail_thread_id: string, subject: string, fromEmail: string, isSupport: boolean, body_text: string, agoMin: number]`.

   Then a single `for (const [tid, subject, fromEmail, isSupport, body, agoMin] of arr)`
   loop that, per entry, inserts ONE gmailThreads row + ONE gmailMessages row:

   - gmailThreads: { user_id: USER, gmail_thread_id: tid, subject,
     participants: [fromEmail, "sarah@wanderbound.co"], is_customer_support: isSupport,
     last_message_at: MIN(agoMin), message_count: 1, last_synced_at: MIN(4) }
   - gmailMessages: { user_id: USER, gmail_message_id: `msg-${tid}`, gmail_thread_id: tid,
     from_address: fromEmail, to_addresses: ["sarah@wanderbound.co"], subject,
     body_text: body, body_html: null, direction: "inbound",
     gmail_received_at: MIN(agoMin), last_synced_at: MIN(4) }

   Use EXACTLY these 23 tuples (order does not matter, but all 23 must be present).
   The first two (aa12 / bb34) and their emails MUST match the approvals in
   section 11 verbatim — do not paraphrase the thread IDs or addresses.

   PRODUCT QUESTIONS — isSupport = true (9):
   1. "gmail-thread-aa12" | "Leather care after rain?" | "maria.g@example.com" | true | "Hi! I got caught in the rain with my Voyager and it's a bit damp. How do I care for the leather so it doesn't get ruined?" | 95
   2. "gmail-thread-bb34" | "Does the Voyager fit a 16\" laptop?" | "devin.r@example.com" | true | "Will my 16-inch MacBook Pro fit in the Voyager Weekender? Looking for something for weekend work trips." | 140
   3. "gmail-thread-cc56" | "Gift wrapping available?" | "priya.s@example.com" | true | "Do you offer gift wrapping? I want to send the Field Notebook to my sister for her birthday next week." | 210
   4. "gmail-thread-dd78" | "Replacement strap for the Summit?" | "tom.b@example.com" | true | "The shoulder strap on my Summit Backpack is fraying after two years. Can I buy a replacement strap?" | 330
   5. "gmail-thread-ee90" | "Tan vs Cognac in person?" | "aisha.k@example.com" | true | "How different are the Tan and Cognac in person? Hard to tell from the photos which one I'd like." | 480
   6. "gmail-thread-ff12" | "Can you monogram the Dopp Kit?" | "marcus.l@example.com" | true | "Do you do monogramming or initials on the Explorer Dopp Kit? Want to gift it to my brother." | 620
   7. "gmail-thread-gg34" | "Voyager vs Summit for a 5-day trip?" | "elena.v@example.com" | true | "Trying to decide between the Voyager Weekender and the Summit Backpack for a 5-day trip. Which would you recommend?" | 760
   8. "gmail-thread-hh56" | "Does the Dopp Kit hold full-size bottles?" | "jordan.p@example.com" | true | "Will the Explorer Dopp Kit fit full-size toiletry bottles, or is it more for travel sizes?" | 910
   9. "gmail-thread-ii78" | "Caring for waxed canvas?" | "nina.r@example.com" | true | "I have one of your waxed canvas pouches — does it need different care than the leather pieces?" | 1080

   ORDER-STATUS — isSupport = false (6):
   10. "gmail-thread-oo01" | "Where's my order #WB-48217?" | "greg.m@example.com" | false | "Hi, I placed order #WB-48217 five days ago and haven't seen a shipping update. Can you check the status?" | 175
   11. "gmail-thread-oo02" | "Order still processing?" | "sara.t@example.com" | false | "My order from last week still says processing. Is everything okay with it?" | 260
   12. "gmail-thread-oo03" | "Tracking number?" | "liam.c@example.com" | false | "Could you send me the tracking number for my recent order? I want to make sure I'm home for delivery." | 400
   13. "gmail-thread-oo04" | "Delivery estimate?" | "bea.n@example.com" | false | "When should I expect my Field Notebook to arrive? Ordered it Tuesday." | 540
   14. "gmail-thread-oo05" | "Change shipping address" | "owen.d@example.com" | false | "I just moved — can you update the shipping address on my order before it goes out?" | 700
   15. "gmail-thread-oo06" | "Order #WB-47990 status" | "chloe.f@example.com" | false | "Checking in on order #WB-47990 — the tracking hasn't updated in three days." | 860

   NEWSLETTER — isSupport = false (5):
   16. "gmail-thread-nn01" | "Re: Weekend at Wanderbound" | "hannah.w@example.com" | false | "Just wanted to say I love these emails — the photography is gorgeous. Keep them coming!" | 300
   17. "gmail-thread-nn02" | "Unsubscribe" | "paul.g@example.com" | false | "Please remove me from your mailing list. Thanks." | 450
   18. "gmail-thread-nn03" | "Re: New arrivals" | "yuki.m@example.com" | false | "When's the next drop? I've been waiting for the olive colorway to come back." | 600
   19. "gmail-thread-nn04" | "Re: Spring lookbook" | "dana.r@example.com" | false | "Loved the lookbook. Any chance you'll do a version for smaller everyday bags?" | 980
   20. "gmail-thread-nn05" | "Emailing a bit too often" | "frank.h@example.com" | false | "You're emailing a bit too often for me — can you dial it back or take me off the list?" | 1200

   SPAM — isSupport = false (3):
   21. "gmail-thread-ss01" | "Boost your store traffic 10x" | "outreach@rankboost-pro.com" | false | "Hi, I noticed your website could rank higher on Google. We guarantee first-page results in 30 days. Reply to learn more." | 520
   22. "gmail-thread-ss02" | "You've been selected for a $500 gift card" | "noreply@gift-rewards-claim.com" | false | "Congratulations! You have been selected to receive a $500 gift card. Click here to claim before it expires." | 1320
   23. "gmail-thread-ss03" | "Quick question about Wanderbound" | "hello@growth-agency-outreach.biz" | false | "Hey, I help DTC brands scale to 7 figures. Do you have 15 minutes this week for a quick call?" | 1500

   Watch the escaped double-quotes inside subjects/bodies (the `16\"` cases). Do not
   add any other tables, columns, or sections. Idempotency is already handled by the
   WIPE — no onConflict needed.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `gmailThreads` and `gmailMessages` are imported from `@/lib/db/schema`.
- WIPE section deletes both gmail tables filtered by USER.
- A new section 3.5 exists after INTEGRATIONS, driven by a single 23-entry tuple
  array, inserting one thread + one message per entry.
- `gmail-thread-aa12`/`maria.g@example.com` and `gmail-thread-bb34`/`devin.r@example.com`
  are present and match the approvals section verbatim.
- `npx tsc --noEmit` passes with no errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Populate the live demo DB and verify counts</name>
  <files>(/tmp throwaway scripts only — NOT committed)</files>
  <action>
Run `reseedDemo()` against the live DB to apply the new seed data, then verify the
counts. The Supabase MCP has no project access; populate by RUNNING the function
(it uses `serviceDb` via DATABASE_URL from `.env.local`). `tsx` lives at
`node_modules/.bin/tsx`.

1. Create a throwaway runner in /tmp (e.g. `/tmp/oz_reseed.ts`) that imports
   `reseedDemo` from `@/lib/demo/seed`, awaits it, then `process.exit(0)` (the
   postgres pool keeps the process alive otherwise). Run from the project root so
   the `@/` path alias resolves:
   `node --env-file=.env.local node_modules/.bin/tsx /tmp/oz_reseed.ts`
   (.env.local provides DEMO_USER_ID + DATABASE_URL — the USER guard needs DEMO_USER_ID).

2. Create a throwaway query script in /tmp (or use psql with DATABASE_URL) that, for
   the demo user, prints:
   - count of gmail_threads (expect 23)
   - count of gmail_messages (expect 23)
   - count of gmail_threads where is_customer_support = true (expect 9)
   Filter by the DEMO_USER_ID user_id. End with process.exit(0).

3. Record the three observed counts in the SUMMARY. If any count is off, fix the
   tuple array in Task 1 and re-run.

Do NOT commit anything in /tmp. Only `lib/demo/seed.ts` gets committed.
  </action>
  <verify>
    <automated>node --env-file=.env.local node_modules/.bin/tsx /tmp/oz_reseed.ts && echo RESEED_OK</automated>
  </verify>
  <done>
- `reseedDemo()` ran cleanly against the live DB and exited 0.
- Live DB for the demo user: gmail_threads = 23, gmail_messages = 23,
  is_customer_support = true count = 9 — all three confirmed and recorded in SUMMARY.
- No /tmp scripts committed; git diff shows only `lib/demo/seed.ts`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| reseedDemo → serviceDb | serviceDb bypasses RLS; the `user_id = DEMO_USER_ID` filter is the only isolation layer. New gmail inserts MUST carry `user_id: USER`. |
| /tmp runner → process.env | Throwaway script loads DEMO_USER_ID + DATABASE_URL from `.env.local`; never hardcode secrets, never commit the script. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mfp-01 | Tampering | reseedDemo gmail inserts | mitigate | Every gmailThreads/gmailMessages insert sets `user_id: USER` (the existing DEMO_USER_ID guard pattern); no cross-user write path introduced. |
| T-mfp-02 | Info Disclosure | /tmp throwaway scripts | mitigate | Scripts live only in /tmp, load secrets from `.env.local`, exit 0, and are never staged/committed (git diff limited to lib/demo/seed.ts). |
| T-mfp-SC | Tampering | npm/pip/cargo installs | accept | No new packages installed; uses existing `tsx` and `@/lib/db/schema`. No package legitimacy gate needed. |
</threat_model>

<verification>
- `npx tsc --noEmit` passes (strict mode, no errors).
- `reseedDemo()` runs against the live DB and exits 0.
- Live DB demo-user counts: gmail_threads = 23, gmail_messages = 23, is_customer_support=true = 9.
- `git status` / `git diff --name-only` shows only `lib/demo/seed.ts` staged for commit.
- aa12 + bb34 thread IDs and their from_addresses match approvals §11 verbatim.
</verification>

<success_criteria>
- Demo inbox tools (`gmail_list_threads`, `gmail_get_thread`) return the 23 seeded
  threads/messages after a reseed instead of an empty inbox.
- 9 threads classified as customer support (product questions); 14 not.
- The two approval-referenced threads (aa12/Maria, bb34/Devin) exist with matching
  from_address, keeping the demo narrative internally consistent.
- Only `lib/demo/seed.ts` is committed; seed remains idempotent (wipe-then-reinsert).
</success_criteria>

<output>
Create `.planning/quick/260526-mfp-seed-gmail-mirror-demo/260526-mfp-SUMMARY.md` when done,
recording the three observed live-DB counts (threads / messages / support).
</output>
