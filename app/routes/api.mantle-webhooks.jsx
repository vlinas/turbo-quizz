import { json } from "@remix-run/node";
import { verifyMantleWebhook } from "../utils/mantle.server";
import db from "../db.server";

/**
 * Mantle Webhook Handler
 *
 * Handles incoming webhooks from Mantle for analytics events:
 * - customers/installed - App installed
 * - customers/uninstalled - App uninstalled
 * - customers/reinstalled - App reinstalled
 * - customers/first_identify - First identification
 * - customers/deactivated - Store deactivated
 * - customers/reactivated - Store reactivated
 * - customers/trial_expired - Trial ended without conversion
 * - subscriptions/activate - Subscription started
 * - subscriptions/cancel - Subscription cancelled
 * - subscriptions/upgrade - Plan upgraded
 * - subscriptions/downgrade - Plan downgraded
 */
export const action = async ({ request }) => {
  // Only accept POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Get raw body for HMAC verification
  const body = await request.text();

  // Verify webhook signature
  if (!verifyMantleWebhook(request, body)) {
    console.error("[Mantle Webhook] Invalid signature");
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    console.error("[Mantle Webhook] Invalid JSON payload");
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = payload.topic || payload.event_type;
  const customer = payload.customer || payload.data?.customer;
  const shop = customer?.myshopifyDomain || customer?.platformId;

  console.log(`[Mantle Webhook] Received: ${topic} for shop: ${shop}`);

  try {
    switch (topic) {
      // Customer lifecycle events
      case "customers/installed":
        console.log(`[Mantle] App installed: ${shop}`);
        // Could trigger onboarding emails, Slack notifications, etc.
        break;

      case "customers/uninstalled":
        console.log(`[Mantle] App uninstalled: ${shop}`);
        // Could trigger win-back campaigns, surveys, etc.
        break;

      case "customers/reinstalled":
        console.log(`[Mantle] App reinstalled: ${shop}`);
        // Could trigger welcome back messages
        break;

      case "customers/first_identify":
        console.log(`[Mantle] First identify: ${shop}`);
        // First time this shop has been seen
        break;

      case "customers/deactivated":
        console.log(`[Mantle] Store deactivated: ${shop}`);
        // Shopify store was deactivated (paused, frozen, etc.)
        break;

      case "customers/reactivated":
        console.log(`[Mantle] Store reactivated: ${shop}`);
        // Shopify store was reactivated
        break;

      case "customers/trial_expired":
        console.log(`[Mantle] Trial expired without conversion: ${shop}`);
        // Could trigger follow-up emails
        break;

      // Subscription events
      case "subscriptions/activate":
        console.log(`[Mantle] Subscription activated: ${shop}`);
        const activePlan = payload.subscription?.plan?.name?.toLowerCase();
        if (shop && activePlan) {
          await db.shopPlan.upsert({
            where: { shop },
            update: { plan: activePlan },
            create: { shop, plan: activePlan },
          });
          console.log(`[Mantle] Updated plan for ${shop} to ${activePlan}`);
        }
        break;

      case "subscriptions/cancel":
        console.log(`[Mantle] Subscription cancelled: ${shop}`);
        if (shop) {
          await db.shopPlan.upsert({
            where: { shop },
            update: { plan: "free" },
            create: { shop, plan: "free" },
          });
          console.log(`[Mantle] Reset plan for ${shop} to free`);
        }
        break;

      case "subscriptions/upgrade":
        console.log(`[Mantle] Subscription upgraded: ${shop}`);
        const upgradedPlan = payload.subscription?.plan?.name?.toLowerCase();
        if (shop && upgradedPlan) {
          await db.shopPlan.upsert({
            where: { shop },
            update: { plan: upgradedPlan },
            create: { shop, plan: upgradedPlan },
          });
          console.log(`[Mantle] Upgraded plan for ${shop} to ${upgradedPlan}`);
        }
        break;

      case "subscriptions/downgrade":
        console.log(`[Mantle] Subscription downgraded: ${shop}`);
        const downgradedPlan = payload.subscription?.plan?.name?.toLowerCase();
        if (shop && downgradedPlan) {
          await db.shopPlan.upsert({
            where: { shop },
            update: { plan: downgradedPlan },
            create: { shop, plan: downgradedPlan },
          });
          console.log(`[Mantle] Downgraded plan for ${shop} to ${downgradedPlan}`);
        }
        break;

      case "customers/features_updated":
        console.log(`[Mantle] Features updated: ${shop}`);
        break;

      case "customers/trial_extended":
        console.log(`[Mantle] Trial extended: ${shop}`);
        break;

      case "custom_fields/updated":
        console.log(`[Mantle] Custom fields updated: ${shop}`);
        break;

      case "plans/create":
        console.log(`[Mantle] Plan created: ${payload.plan?.name}`);
        break;

      case "plans/update":
        console.log(`[Mantle] Plan updated: ${payload.plan?.name}`);
        break;

      default:
        console.log(`[Mantle Webhook] Unhandled topic: ${topic}`);
    }
  } catch (error) {
    console.error(`[Mantle Webhook] Error processing ${topic}:`, error);
    // Still return 200 to acknowledge receipt
  }

  // Return 200 OK to acknowledge receipt
  return json({ success: true }, { status: 200 });
};

// Reject GET requests
export const loader = async () => {
  return json({ error: "Method not allowed" }, { status: 405 });
};
