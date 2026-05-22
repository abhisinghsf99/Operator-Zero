/**
 * lib/integrations/gmail/classify.ts
 * Gmail support-email classifier using Anthropic fast-path.
 *
 * Uses a minimal YES/NO prompt to determine whether an email thread is a
 * customer support inquiry.
 *
 * SECURITY (T-2-04-03):
 *   - Email content is treated as DATA, not instructions
 *   - The prompt asks only for a YES/NO label; output is coerced to boolean
 *   - No tool access — classifier has no side effects
 */
import { anthropic } from "@/lib/agent/anthropic";

/**
 * Classify whether an email is a customer support inquiry.
 *
 * @param subject  Email subject line (may be empty string)
 * @param snippet  Short text preview or body excerpt (may be empty string)
 * @returns true if the email appears to be a customer support question
 */
export async function classifySupport(
  subject: string,
  snippet: string
): Promise<boolean> {
  // Build the classification prompt.
  // T-2-04-03: email content is data in the user turn; the system prompt
  // confines the model to a single YES/NO response.
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 10,
    system:
      "You are a classifier. Reply with YES if the email is a customer support question about an order, product, refund, shipping, account, or store policy. Reply NO otherwise. Only reply YES or NO — nothing else.",
    messages: [
      {
        role: "user",
        content: `Subject: ${subject}\nSnippet: ${snippet}`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim().toUpperCase()
      : "NO";

  return text.startsWith("YES");
}
