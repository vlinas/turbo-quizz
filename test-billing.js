// Test billing configuration
// Run this with: node test-billing.js

import { BillingInterval } from "@shopify/shopify-api";

const PREMIUM_PLAN = "Simple Product Page Quiz - Premium";

const billingConfig = {
  [PREMIUM_PLAN]: {
    amount: 14.99,
    trialDays: 7,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
  }
};

console.log("=== Billing Configuration ===");
console.log("Plan name:", PREMIUM_PLAN);
console.log("Plan name length:", PREMIUM_PLAN.length);
console.log("Plan name bytes:", Buffer.from(PREMIUM_PLAN).toString('hex'));
console.log("\nBilling config:");
console.log(JSON.stringify(billingConfig, null, 2));

console.log("\n=== Important Notes ===");
console.log("1. For App Store apps, the plan name MUST exactly match the plan name in your Shopify Partners app listing");
console.log("2. Check that the plan name in Partners dashboard is:", PREMIUM_PLAN);
console.log("3. Check that pricing in Partners dashboard is: $14.99 USD every 30 days with 7-day trial");
console.log("4. The app must be approved and published on the App Store for billing to work");
