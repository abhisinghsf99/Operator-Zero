/**
 * lib/integrations/gmail/sync.ts
 * Gmail thread + message sync — initial 30-day load and History API incremental polling.
 *
 * Provides:
 *   - gmailInitialSync(userId): pulls last 30 days of threads, UPSERTs mirror tables,
 *     captures profile.historyId as the History API cursor (last_history_id).
 *   - gmailIncrementalSync(userId): advances the cursor using the History API
 *     (history.list startHistoryId=last_history_id), UPSERTs new messages,
 *     updates last_history_id + last_poll_at.
 *   - getActiveGmailUserIds(): returns user IDs with active gmail integrations (for cron fan-out)
 *
 * SECURITY:
 *   T-2-04-04: every serviceDb query filtered by user_id — RLS not active in agent tier
 *   T-2-04-03: email content classified via classifySupport (YES/NO only, no tool access)
 */
import { createGmailClient } from "./client";
import { classifySupport } from "./classify";
import { serviceDb } from "@/lib/db/client";
import {
  gmailThreads,
  gmailMessages,
  gmailSyncState,
} from "@/lib/db/schema/gmail-mirror";
import { integrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/** Helper: extract header value from a Gmail message header array */
function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string
): string | null {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    null
  );
}

/** Helper: decode base64url-encoded Gmail body data */
function decodeBody(data: string | undefined | null): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/** Fetch the full thread detail from Gmail API */
async function fetchThread(
  gmail: Awaited<ReturnType<typeof createGmailClient>>,
  userId: string,
  threadId: string
): Promise<{
  thread: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
}> {
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const thread = res.data as Record<string, unknown>;
  const messages = (thread.messages as Array<Record<string, unknown>>) ?? [];
  return { thread, messages };
}

/** UPSERT a single gmail_thread row including is_customer_support classification */
async function upsertThread(
  userId: string,
  threadId: string,
  messages: Array<Record<string, unknown>>,
  snippet?: string
): Promise<void> {
  // Use the first message to extract subject and participants
  const firstMsg = messages[0] ?? {};
  const payload = (firstMsg.payload as Record<string, unknown> | undefined) ?? {};
  const headers = (payload.headers as Array<{ name: string; value: string }>) ?? [];

  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const participants = [from, to].filter(Boolean) as string[];

  // Most recent message timestamp
  const lastMsg = messages[messages.length - 1] ?? firstMsg;
  const internalDate = lastMsg.internalDate as string | undefined;
  const lastMessageAt = internalDate ? new Date(Number(internalDate)) : null;

  // Classify via Anthropic fast-path (T-2-04-03)
  const snippetText = (snippet ?? subject ?? "").slice(0, 200);
  const isCustomerSupport = await classifySupport(subject ?? "", snippetText);

  await serviceDb
    .insert(gmailThreads)
    .values({
      user_id: userId,
      gmail_thread_id: threadId,
      subject,
      participants,
      is_customer_support: isCustomerSupport,
      last_message_at: lastMessageAt,
      message_count: messages.length,
      last_synced_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [gmailThreads.user_id, gmailThreads.gmail_thread_id],
      set: {
        subject,
        participants,
        is_customer_support: isCustomerSupport,
        last_message_at: lastMessageAt,
        message_count: messages.length,
        last_synced_at: new Date(),
      },
    });
}

/** UPSERT a single gmail_message row */
async function upsertMessage(
  userId: string,
  threadId: string,
  msg: Record<string, unknown>
): Promise<void> {
  const msgId = msg.id as string;
  const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
  const headers = (payload.headers as Array<{ name: string; value: string }>) ?? [];

  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const subject = getHeader(headers, "Subject");

  // Decode body (plain text first, then HTML)
  const parts = (payload.parts as Array<Record<string, unknown>>) ?? [];
  let bodyText = "";
  let bodyHtml = "";

  const textPart = parts.find((p) => p.mimeType === "text/plain");
  const htmlPart = parts.find((p) => p.mimeType === "text/html");

  if (textPart) {
    const body = textPart.body as Record<string, unknown> | undefined;
    bodyText = decodeBody(body?.data as string | undefined);
  } else {
    const body = payload.body as Record<string, unknown> | undefined;
    bodyText = decodeBody(body?.data as string | undefined);
  }
  if (htmlPart) {
    const body = htmlPart.body as Record<string, unknown> | undefined;
    bodyHtml = decodeBody(body?.data as string | undefined);
  }

  // Detect direction based on labels
  const labelIds = (msg.labelIds as string[]) ?? [];
  let direction: "inbound" | "outbound" | "draft" = "inbound";
  if (labelIds.includes("SENT")) direction = "outbound";
  if (labelIds.includes("DRAFT")) direction = "draft";

  const internalDate = msg.internalDate as string | undefined;
  const receivedAt = internalDate ? new Date(Number(internalDate)) : null;

  await serviceDb
    .insert(gmailMessages)
    .values({
      user_id: userId,
      gmail_message_id: msgId,
      gmail_thread_id: threadId,
      from_address: from,
      to_addresses: to ? [to] : [],
      subject,
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      direction,
      gmail_received_at: receivedAt,
      last_synced_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [gmailMessages.user_id, gmailMessages.gmail_message_id],
      set: {
        gmail_thread_id: threadId,
        from_address: from,
        to_addresses: to ? [to] : [],
        subject,
        body_text: bodyText || null,
        body_html: bodyHtml || null,
        direction,
        gmail_received_at: receivedAt,
        last_synced_at: new Date(),
      },
    });
}

// ─── gmailInitialSync ─────────────────────────────────────────────────────────

/**
 * Perform a 30-day initial sync for a user who just connected Gmail.
 *
 * 1. threads.list q='newer_than:30d' (cursor-paginated)
 * 2. For each thread: fetch full content, UPSERT gmail_threads + gmail_messages
 * 3. getProfile to capture historyId as the cursor for future incremental syncs
 */
export async function gmailInitialSync(userId: string): Promise<void> {
  const gmail = await createGmailClient(userId);

  // Step 1: list all threads from the last 30 days (cursor-paginated)
  let pageToken: string | undefined;
  const allThreadIds: string[] = [];

  do {
    const res = await gmail.users.threads.list({
      userId: "me",
      q: "newer_than:30d",
      maxResults: 100,
      ...(pageToken ? { pageToken } : {}),
    });

    const threads = (res.data.threads as Array<{ id: string }> | undefined) ?? [];
    for (const t of threads) {
      if (t.id) allThreadIds.push(t.id);
    }

    pageToken = (res.data.nextPageToken as string | undefined) ?? undefined;
  } while (pageToken);

  // Step 2: for each thread, fetch details and UPSERT
  for (const threadId of allThreadIds) {
    try {
      const { thread, messages } = await fetchThread(gmail, userId, threadId);
      const snippet = (thread.snippet as string | undefined) ?? "";

      await upsertThread(userId, threadId, messages, snippet);
      for (const msg of messages) {
        await upsertMessage(userId, threadId, msg);
      }
    } catch (err) {
      console.log(
        JSON.stringify({
          level: "warn",
          event: "gmail.initial_sync.thread_error",
          userId,
          threadId,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        })
      );
      // Continue with next thread
    }
  }

  // Step 3: capture historyId cursor from Gmail profile
  const profileRes = await gmail.users.getProfile({ userId: "me" });
  const historyId = (profileRes.data.historyId as string | undefined) ?? null;

  await serviceDb
    .update(gmailSyncState)
    .set({
      last_history_id: historyId,
      last_poll_at: new Date(),
      sync_status: "healthy",
    })
    .where(eq(gmailSyncState.user_id, userId));

  // Insert if not exists (initial sync creates the row)
  // Using insert with onConflictDoUpdate to handle both create and update
  await serviceDb
    .insert(gmailSyncState)
    .values({
      user_id: userId,
      last_history_id: historyId,
      last_poll_at: new Date(),
      sync_status: "healthy",
    })
    .onConflictDoUpdate({
      target: [gmailSyncState.user_id],
      set: {
        last_history_id: historyId,
        last_poll_at: new Date(),
        sync_status: "healthy",
      },
    });

  console.log(
    JSON.stringify({
      level: "info",
      event: "gmail.initial_sync.complete",
      userId,
      threadsProcessed: allThreadIds.length,
      historyId,
      timestamp: new Date().toISOString(),
    })
  );
}

// ─── gmailIncrementalSync ─────────────────────────────────────────────────────

/**
 * Perform an incremental sync using the Gmail History API.
 *
 * 1. Load last_history_id from gmail_sync_state
 * 2. history.list startHistoryId=last_history_id historyTypes=['messageAdded']
 * 3. UPSERT new messages + threads
 * 4. Advance last_history_id + update last_poll_at
 *
 * If historyId has expired (404/410 from Gmail), falls back to gmailInitialSync.
 */
export async function gmailIncrementalSync(userId: string): Promise<void> {
  // Load the cursor
  const [syncState] = await serviceDb
    .select({
      last_history_id: gmailSyncState.last_history_id,
    })
    .from(gmailSyncState)
    .where(eq(gmailSyncState.user_id, userId))
    .limit(1);

  if (!syncState?.last_history_id) {
    // No cursor — trigger initial sync
    await gmailInitialSync(userId);
    return;
  }

  const gmail = await createGmailClient(userId);

  let latestHistoryId = syncState.last_history_id;

  try {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId: syncState.last_history_id,
      historyTypes: ["messageAdded"],
    });

    const history = (res.data.history as Array<Record<string, unknown>>) ?? [];
    const newHistoryId =
      (res.data.historyId as string | undefined) ?? latestHistoryId;

    latestHistoryId = newHistoryId;

    // Process new messages from history records
    for (const record of history) {
      const messagesAdded =
        (record.messagesAdded as Array<Record<string, unknown>>) ?? [];
      for (const item of messagesAdded) {
        const msg = item.message as Record<string, unknown> | undefined;
        if (!msg?.id || !msg?.threadId) continue;

        const msgId = msg.id as string;
        const threadId = msg.threadId as string;

        try {
          // Fetch full thread for context
          const { thread, messages: threadMessages } = await fetchThread(
            gmail,
            userId,
            threadId
          );
          const snippet = (thread.snippet as string | undefined) ?? "";

          await upsertThread(userId, threadId, threadMessages, snippet);
          for (const fullMsg of threadMessages) {
            await upsertMessage(userId, threadId, fullMsg);
          }
        } catch (err) {
          console.log(
            JSON.stringify({
              level: "warn",
              event: "gmail.incremental_sync.message_error",
              userId,
              msgId,
              threadId,
              error: err instanceof Error ? err.message : String(err),
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    }
  } catch (err) {
    // Handle historyId expiry (404/410) — fall back to full re-sync
    const code = (err as { code?: number }).code;
    if (code === 404 || code === 410) {
      console.log(
        JSON.stringify({
          level: "warn",
          event: "gmail.incremental_sync.history_expired",
          userId,
          timestamp: new Date().toISOString(),
        })
      );
      await gmailInitialSync(userId);
      return;
    }
    throw err;
  }

  // Advance the cursor
  await serviceDb
    .update(gmailSyncState)
    .set({
      last_history_id: latestHistoryId,
      last_poll_at: new Date(),
      sync_status: "healthy",
    })
    .where(eq(gmailSyncState.user_id, userId));

  console.log(
    JSON.stringify({
      level: "info",
      event: "gmail.incremental_sync.complete",
      userId,
      newHistoryId: latestHistoryId,
      timestamp: new Date().toISOString(),
    })
  );
}

// ─── getActiveGmailUserIds ─────────────────────────────────────────────────────

/**
 * Return all user IDs that have an active Gmail integration.
 * Used by the gmailIncrementalPoll cron to fan out per user.
 */
export async function getActiveGmailUserIds(): Promise<string[]> {
  const rows = await serviceDb
    .select({ user_id: integrations.user_id })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "gmail"),
        eq(integrations.status, "active")
      )
    );

  return rows.map((r) => r.user_id);
}
