/**
 * Discord Webhook Notifications
 *
 * Sends notifications to Discord for app lifecycle events:
 * - App installs
 * - App uninstalls
 * - Plan changes (upgrades, downgrades, cancellations)
 */

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/**
 * Send a message to Discord webhook
 * @param {Object} embed - Discord embed object
 */
async function sendDiscordNotification(embed) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log("[Discord] Webhook URL not configured, skipping notification");
    return;
  }

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      console.error("[Discord] Failed to send notification:", response.status, await response.text());
    } else {
      console.log("[Discord] Notification sent successfully");
    }
  } catch (error) {
    console.error("[Discord] Error sending notification:", error.message);
    // Don't throw - Discord failures shouldn't break the app
  }
}

/**
 * Get current timestamp in readable format
 */
function getTimestamp() {
  return new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

/**
 * Notify when app is installed
 * @param {string} shop - Shop domain
 * @param {Object} shopData - Shop data from Shopify (optional)
 */
export async function notifyAppInstalled(shop, shopData = {}) {
  const embed = {
    title: "🟢 New Install",
    color: 0x00ff00, // Green
    fields: [
      {
        name: "Shop",
        value: shop,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  if (shopData.email) {
    embed.fields.push({
      name: "Email",
      value: shopData.email,
      inline: true,
    });
  }

  if (shopData.name) {
    embed.fields.push({
      name: "Store Name",
      value: shopData.name,
      inline: true,
    });
  }

  await sendDiscordNotification(embed);
}

/**
 * Notify when app is uninstalled
 * @param {string} shop - Shop domain
 */
export async function notifyAppUninstalled(shop) {
  const embed = {
    title: "🔴 App Uninstalled",
    color: 0xff0000, // Red
    fields: [
      {
        name: "Shop",
        value: shop,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  await sendDiscordNotification(embed);
}

/**
 * Notify when subscription plan changes
 * @param {string} shop - Shop domain
 * @param {string} planName - Name of the plan
 * @param {string} status - Subscription status (ACTIVE, CANCELLED, DECLINED, etc.)
 */
export async function notifyPlanChange(shop, planName, status) {
  // Choose color based on status
  let color = 0x0099ff; // Blue default
  let emoji = "🔄";

  if (status === "ACTIVE") {
    color = 0x00ff00; // Green
    emoji = "✅";
  } else if (status === "CANCELLED" || status === "EXPIRED") {
    color = 0xff0000; // Red
    emoji = "❌";
  } else if (status === "DECLINED") {
    color = 0xffaa00; // Orange
    emoji = "⚠️";
  } else if (status === "FROZEN") {
    color = 0x9999ff; // Light blue
    emoji = "❄️";
  }

  const embed = {
    title: `${emoji} Plan Changed`,
    color: color,
    fields: [
      {
        name: "Shop",
        value: shop,
        inline: true,
      },
      {
        name: "Plan",
        value: planName || "Unknown",
        inline: true,
      },
      {
        name: "Status",
        value: status,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  await sendDiscordNotification(embed);
}

/**
 * Notify when a subscription charge is successful
 * @param {string} shop - Shop domain
 * @param {string} planName - Name of the plan
 * @param {string} amount - Charge amount
 */
export async function notifySubscriptionCharge(shop, planName, amount) {
  const embed = {
    title: "💰 Subscription Charge",
    color: 0x00ff00, // Green
    fields: [
      {
        name: "Shop",
        value: shop,
        inline: true,
      },
      {
        name: "Plan",
        value: planName || "Unknown",
        inline: true,
      },
      {
        name: "Amount",
        value: amount || "N/A",
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  await sendDiscordNotification(embed);
}
