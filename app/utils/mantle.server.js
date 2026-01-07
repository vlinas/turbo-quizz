import { MantleClient } from "@heymantle/client";

// Initialize Mantle client for server-side operations
// Only used in production where MANTLE_APP_ID and MANTLE_API_KEY are set
let mantleClient = null;

export function getMantleClient() {
  if (!process.env.MANTLE_APP_ID || !process.env.MANTLE_API_KEY) {
    return null;
  }

  if (!mantleClient) {
    mantleClient = new MantleClient({
      appId: process.env.MANTLE_APP_ID,
      apiKey: process.env.MANTLE_API_KEY,
    });
  }

  return mantleClient;
}

/**
 * Identify a shop with Mantle for analytics tracking
 * This should be called in the afterAuth hook when a shop installs or re-authenticates
 *
 * @param {Object} params
 * @param {string} params.shop - The myshopify domain (e.g., "store.myshopify.com")
 * @param {string} params.accessToken - The Shopify access token
 * @param {string} params.shopId - The Shopify shop ID (numeric)
 * @param {string} params.name - The shop name
 * @param {string} params.email - The shop email
 * @param {Object} params.customFields - Optional custom fields to track
 * @returns {Promise<{apiToken: string}|null>} The customer API token for frontend use, or null if Mantle is not configured
 */
export async function identifyShopWithMantle({
  shop,
  accessToken,
  shopId,
  name,
  email,
  customFields = {},
}) {
  const client = getMantleClient();
  if (!client) {
    console.log("[Mantle] Not configured, skipping identify");
    return null;
  }

  try {
    const result = await client.identify({
      platform: "shopify",
      platformId: shopId,
      myshopifyDomain: shop,
      accessToken: accessToken,
      name: name,
      email: email,
      customFields: customFields,
    });

    console.log(`[Mantle] Successfully identified shop: ${shop}`);
    return result;
  } catch (error) {
    console.error("[Mantle] Error identifying shop:", error.message);
    return null;
  }
}

/**
 * Send a usage event to Mantle for analytics
 *
 * @param {Object} params
 * @param {string} params.customerApiToken - The customer API token from identify
 * @param {string} params.eventName - The event name (e.g., "quiz_created", "quiz_completed")
 * @param {Object} params.properties - Optional event properties
 */
export async function sendMantleUsageEvent({
  customerApiToken,
  eventName,
  properties = {},
}) {
  if (!process.env.MANTLE_APP_ID || !customerApiToken) {
    return null;
  }

  try {
    // Create a customer-scoped client
    const customerClient = new MantleClient({
      appId: process.env.MANTLE_APP_ID,
      customerApiToken: customerApiToken,
    });

    await customerClient.sendUsageEvent({
      eventName,
      properties,
    });

    console.log(`[Mantle] Sent usage event: ${eventName}`);
    return true;
  } catch (error) {
    console.error(`[Mantle] Error sending usage event ${eventName}:`, error.message);
    return null;
  }
}

/**
 * Verify Mantle webhook HMAC signature
 *
 * @param {Request} request - The incoming request
 * @param {string} body - The raw request body
 * @returns {boolean} Whether the signature is valid
 */
export function verifyMantleWebhook(request, body) {
  const crypto = require("crypto");

  const hmacHeader = request.headers.get("X-Mantle-Hmac-SHA256");
  const timestamp = request.headers.get("X-Timestamp");

  if (!hmacHeader || !timestamp || !process.env.MANTLE_API_KEY) {
    return false;
  }

  // Mantle signs: timestamp.payload
  const dataToSign = `${timestamp}.${body}`;
  const computedHmac = crypto
    .createHmac("sha256", process.env.MANTLE_API_KEY)
    .update(dataToSign)
    .digest("base64");

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(computedHmac)
    );
  } catch {
    return false;
  }
}
