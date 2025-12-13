import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2023-10";
import prisma from "./db.server";
import { BillingInterval } from "@shopify/shopify-api";
export const PREMIUM_PLAN = "premium";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  restResources,
  billing:{
    [PREMIUM_PLAN]: {
      amount: 14.99,
      trialDays: 7,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
    }
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // Mandatory GDPR compliance webhooks
    CUSTOMERS_DATA_REQUEST: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    CUSTOMERS_REDACT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    SHOP_REDACT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // Note: ORDERS_PAID and ORDERS_CREATE require protected customer data approval
    // Using API polling instead via /api/sync-orders endpoint
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      try {
        console.log('[afterAuth] Registering webhooks for shop:', session.shop);
        const result = await shopify.registerWebhooks({ session });
        console.log('[afterAuth] Webhook registration result:', JSON.stringify(result, null, 2));

        // Set app URL metafield for theme extension
        try {
          console.log('[afterAuth] Setting app URL metafield');
          const appUrl = process.env.SHOPIFY_APP_URL || '';

          if (appUrl) {
            const metafieldResult = await admin.graphql(
              `#graphql
              mutation CreateShopMetafield($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                  metafields {
                    id
                    namespace
                    key
                    value
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }`,
              {
                variables: {
                  metafields: [
                    {
                      namespace: "turbo_quiz",
                      key: "app_url",
                      type: "single_line_text_field",
                      value: appUrl,
                      ownerId: `gid://shopify/Shop/${session.shop.replace('.myshopify.com', '')}`
                    }
                  ]
                }
              }
            );

            const metafieldData = await metafieldResult.json();
            if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
              console.error('[afterAuth] Metafield creation errors:', metafieldData.data.metafieldsSet.userErrors);
            } else {
              console.log('[afterAuth] App URL metafield set successfully:', appUrl);
            }
          } else {
            console.warn('[afterAuth] SHOPIFY_APP_URL not set - skipping metafield creation');
          }
        } catch (metafieldError) {
          console.error('[afterAuth] Failed to set app URL metafield:', metafieldError);
        }

        // Check if shop already has an active subscription
        console.log('[afterAuth] Checking for existing subscription');
        const subscriptionResult = await admin.graphql(
          `#graphql
          query {
            app {
              installation {
                activeSubscriptions {
                  id
                  name
                  status
                }
              }
            }
          }`
        );

        const subscriptionData = await subscriptionResult.json();
        const activeSubscriptions = subscriptionData.data?.app?.installation?.activeSubscriptions || [];
        const hasActiveSubscription = activeSubscriptions.some(sub => sub.status === 'ACTIVE');

        if (!hasActiveSubscription) {
          console.log('[afterAuth] No active subscription found - billing will be required when accessing app');
        } else {
          console.log('[afterAuth] Active subscription found:', activeSubscriptions[0].name);
        }
      } catch (error) {
        console.error('[afterAuth] Webhook registration failed:', error);
        console.error('[afterAuth] Error details:', error.message, error.stack);
      }
    },
  },
  future: {
    v3_webhookAdminContext: true,
    v3_authenticatePublic: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
