import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Divider,
  Icon,
  Box,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";

import { authenticate, PLAN_STARTER, PLAN_GROWTH } from "../shopify.server";
import prisma from "../db.server";
import { PLANS } from "../utils/plan-limits";

export const loader = async ({ request }) => {
  const { session, admin, billing } = await authenticate.admin(request);

  // Get current shop plan
  let shopPlan = await prisma.shopPlan.findUnique({
    where: { shop: session.shop },
  });
  if (!shopPlan) {
    shopPlan = await prisma.shopPlan.create({
      data: { shop: session.shop, plan: "free" },
    });
  }

  // Get current quiz count
  const quizCount = await prisma.quiz.count({
    where: {
      shop: session.shop,
      deleted_at: null,
    },
  });

  return json({
    currentPlan: shopPlan.plan,
    quizCount,
    plans: PLANS,
  });
};

export const action = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const selectedPlan = formData.get("plan");

  if (selectedPlan === "starter") {
    // Request Shopify billing for Starter plan
    await billing.require({
      plans: [PLAN_STARTER],
      isTest: process.env.NODE_ENV !== "production",
      onFailure: async () => {
        throw new Response("Billing failed", { status: 400 });
      },
    });
  } else if (selectedPlan === "growth") {
    // Request Shopify billing for Growth plan
    await billing.require({
      plans: [PLAN_GROWTH],
      isTest: process.env.NODE_ENV !== "production",
      onFailure: async () => {
        throw new Response("Billing failed", { status: 400 });
      },
    });
  }

  // Update shop plan in database
  await prisma.shopPlan.upsert({
    where: { shop: session.shop },
    update: { plan: selectedPlan },
    create: { shop: session.shop, plan: selectedPlan },
  });

  return redirect("/app");
};

export default function Pricing() {
  const { currentPlan, quizCount, plans } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();

  const handleSelectPlan = (planKey) => {
    if (planKey === currentPlan) return;

    if (planKey === "free") {
      // Downgrade to free - just update the plan
      submit({ plan: "free" }, { method: "post" });
    } else {
      // Upgrade - trigger Shopify billing
      submit({ plan: planKey }, { method: "post" });
    }
  };

  const planCards = [
    {
      key: "free",
      ...plans.free,
      buttonText: currentPlan === "free" ? "Current plan" : "Downgrade",
      buttonDisabled: currentPlan === "free",
      buttonTone: currentPlan === "free" ? undefined : "critical",
    },
    {
      key: "starter",
      ...plans.starter,
      buttonText: currentPlan === "starter" ? "Current plan" : currentPlan === "growth" ? "Downgrade" : "Upgrade",
      buttonDisabled: currentPlan === "starter",
      buttonTone: currentPlan === "starter" ? undefined : currentPlan === "growth" ? "critical" : undefined,
      recommended: currentPlan === "free",
    },
    {
      key: "growth",
      ...plans.growth,
      buttonText: currentPlan === "growth" ? "Current plan" : "Upgrade",
      buttonDisabled: currentPlan === "growth",
      recommended: currentPlan === "starter",
    },
  ];

  return (
    <Page
      title="Pricing"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" variant="bodyLg" tone="subdued">
              Choose the plan that's right for your business. You currently have {quizCount} quiz{quizCount !== 1 ? "es" : ""}.
            </Text>

            <InlineStack gap="400" align="center" wrap={false}>
              {planCards.map((plan) => (
                <Box key={plan.key} width="100%">
                  <Card>
                    <BlockStack gap="400">
                      {/* Header */}
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h2" variant="headingLg">
                          {plan.name}
                        </Text>
                        {plan.recommended && (
                          <Badge tone="success">Recommended</Badge>
                        )}
                        {currentPlan === plan.key && (
                          <Badge tone="info">Current</Badge>
                        )}
                      </InlineStack>

                      {/* Price */}
                      <BlockStack gap="100">
                        <InlineStack gap="100" blockAlign="baseline">
                          <Text as="span" variant="heading2xl">
                            ${plan.price}
                          </Text>
                          {plan.price > 0 && (
                            <Text as="span" variant="bodyMd" tone="subdued">
                              /month
                            </Text>
                          )}
                        </InlineStack>
                        {plan.price === 0 && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Forever free
                          </Text>
                        )}
                      </BlockStack>

                      <Divider />

                      {/* Features */}
                      <BlockStack gap="200">
                        {plan.features.map((feature, index) => (
                          <InlineStack key={index} gap="200" blockAlign="center">
                            <Icon source={CheckIcon} tone="success" />
                            <Text as="span" variant="bodyMd">
                              {feature}
                            </Text>
                          </InlineStack>
                        ))}
                      </BlockStack>

                      <Divider />

                      {/* Button */}
                      <Button
                        variant={plan.recommended && !plan.buttonDisabled ? "primary" : undefined}
                        tone={plan.buttonTone}
                        disabled={plan.buttonDisabled}
                        onClick={() => handleSelectPlan(plan.key)}
                        fullWidth
                      >
                        {plan.buttonText}
                      </Button>
                    </BlockStack>
                  </Card>
                </Box>
              ))}
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
