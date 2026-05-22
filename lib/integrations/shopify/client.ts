/**
 * lib/integrations/shopify/client.ts
 * Shopify integration adapter — OAuth helpers + GraphQL client.
 *
 * Provides:
 *   - shopifyInstance(): configured @shopify/shopify-api instance (per-request, lazy)
 *   - ShopifyAdapter: IntegrationAdapter implementation (loadCredentials + shopifyGraphQL)
 *   - verifyOAuthHmac(): HMAC validation for OAuth callback params
 *   - sanitizeShopDomain(): validate shop param is a .myshopify.com domain
 *
 * SECURITY (T-2-03-05): tokens are ONLY accessed as ciphertext; decrypted inline
 * in loadCredentials() and never logged.
 *
 * SECURITY (T-2-03-03): sanitizeShopDomain() rejects non-.myshopify.com hosts.
 */
import "@shopify/shopify-api/adapters/node";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import type { ShopifyRestResources } from "@shopify/shopify-api";
import type { IntegrationAdapter } from "../adapter";
import { decryptToken } from "../crypto";
import { serviceDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// ─── Env helpers ──────────────────────────────────────────────────────────────

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

/**
 * Returns an @shopify/shopify-api instance configured from env.
 * Called per-use so tests can stub env vars without module-load side effects.
 * Adapter (node) is registered once at import time.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ShopifyRestResourcesUnused = ShopifyRestResources;

export function shopifyInstance(hostName: string = "localhost") {
  // Type args inferred from the config object — do NOT specify explicit type args (TS2344)
  return shopifyApi({
    apiKey: getEnv("SHOPIFY_CLIENT_ID"),
    apiSecretKey: getEnv("SHOPIFY_CLIENT_SECRET"),
    scopes: getEnv("SHOPIFY_SCOPES").split(","),
    hostName,
    apiVersion: (getEnv("SHOPIFY_API_VERSION") as ApiVersion) ?? ApiVersion.October24,
    isEmbeddedApp: false,
  });
}

// ─── Domain validation (T-2-03-03) ───────────────────────────────────────────

const SHOP_DOMAIN_RE = /^[a-z0-9-]+\.myshopify\.com$/;

/**
 * Validates that `shop` is a plain *.myshopify.com domain.
 * Returns the validated domain string, or null if invalid.
 * Prevents SSRF / open-redirect attacks via user-controlled shop param.
 */
export function sanitizeShopDomain(shop: string | null | undefined): string | null {
  if (!shop) return null;
  // Must be exactly hostname — no scheme, path, or port
  if (shop.includes("://") || shop.includes("/") || shop.includes(":")) return null;
  if (!SHOP_DOMAIN_RE.test(shop.toLowerCase())) return null;
  return shop.toLowerCase();
}

// ─── HMAC verification (T-2-03-02) ───────────────────────────────────────────

/**
 * Verifies the OAuth callback HMAC using @shopify/shopify-api's validateHmac.
 * Returns true if valid, false otherwise. Does NOT throw on mismatch.
 * Must be called with all params including the hmac field.
 */
export async function verifyOAuthHmac(
  params: Record<string, string>,
  hostName: string = "localhost"
): Promise<boolean> {
  try {
    const shopify = shopifyInstance(hostName);
    return await shopify.utils.validateHmac(params);
  } catch {
    // validateHmac throws on timestamp out of tolerance — treat as invalid
    return false;
  }
}

// ─── ShopifyAdapter ───────────────────────────────────────────────────────────

export class ShopifyAdapter implements IntegrationAdapter {
  constructor(private readonly userId: string) {}

  /**
   * Loads decrypted credentials for this user's Shopify integration.
   * Throws if no integration exists.
   */
  async loadCredentials(): Promise<{ accessToken: string; shopDomain: string }> {
    const [row] = await serviceDb
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.user_id, this.userId),
          eq(integrations.provider, "shopify")
        )
      )
      .limit(1);

    if (!row) {
      throw new Error(`No Shopify integration for user ${this.userId}`);
    }

    const accessToken = await decryptToken(row.access_token_encrypted);
    return {
      accessToken,
      shopDomain: row.provider_account_id ?? "",
    };
  }

  /**
   * Execute a Shopify Admin GraphQL query.
   * Decrypts the stored token inline — never logs it.
   */
  async shopifyGraphQL<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const { accessToken, shopDomain } = await this.loadCredentials();
    const shopify = shopifyInstance(shopDomain);

    // Build session object matching Shopify Session shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session: any = {
      id: `${this.userId}-shopify`,
      shop: shopDomain,
      state: "",
      isOnline: false,
      scope: getEnv("SHOPIFY_SCOPES"),
      accessToken,
    };
    const client = new shopify.clients.Graphql({ session });

    const response = await client.request(query, { variables });
    return response.data as T;
  }

  /**
   * Verifies token is present and not expired/revoked.
   * Returns true if status is 'active'.
   */
  async isHealthy(): Promise<boolean> {
    const [row] = await serviceDb
      .select({ status: integrations.status })
      .from(integrations)
      .where(
        and(
          eq(integrations.user_id, this.userId),
          eq(integrations.provider, "shopify")
        )
      )
      .limit(1);

    return row?.status === "active";
  }

  /**
   * Shopify tokens are long-lived (no expiry by default).
   * If a 401 is received during API calls, the user must reconnect via OAuth.
   */
  async refreshToken(): Promise<void> {
    // Shopify OAuth tokens do not have a refresh mechanism.
    // On 401, mark integration as expired and surface reconnect path.
    await serviceDb
      .update(integrations)
      .set({ status: "expired", last_error: "Token revoked or expired — reconnect required" })
      .where(
        and(
          eq(integrations.user_id, this.userId),
          eq(integrations.provider, "shopify")
        )
      );
    throw new Error("Shopify token expired — user must reconnect via OAuth");
  }
}
