import { useEffect, useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigate, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  Badge,
  Toast,
  Frame,
  Icon,
  Divider,
  Box,
  Banner,
  TextField,
  Modal,
  ProgressBar,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ChatIcon,
  CheckIcon,
} from "@shopify/polaris-icons";
import { authenticate, PLAN_STARTER, PLAN_GROWTH } from "../shopify.server";
import prisma from "../db.server";
import { PLANS, getQuizLimit, getQuizLimitDisplay } from "../utils/plan-limits";

export const loader = async ({ request }) => {
  const { admin, session, billing } = await authenticate.admin(request);

  // Get shop's current plan from database
  let shopPlan = await prisma.shopPlan.findUnique({
    where: { shop: session.shop },
  });
  if (!shopPlan) {
    shopPlan = await prisma.shopPlan.create({
      data: { shop: session.shop, plan: "free" },
    });
  }

  // Get quiz count for usage display
  const quizCount = await prisma.quiz.count({
    where: {
      shop: session.shop,
      deleted_at: null,
    },
  });

  // Get subscription info from Shopify
  const result = await admin.graphql(
    `#graphql
    query Shop {
      app {
        installation {
          activeSubscriptions {
            id
            name
            createdAt
            status
            currentPeriodEnd
            test
          }
        }
      }
    }`,
    { variables: {} }
  );

  const resultJson = await result.json();
  const { activeSubscriptions } = resultJson.data.app.installation;

  let activeSubscription = null;
  if (activeSubscriptions.length > 0) {
    activeSubscription = activeSubscriptions.find((sub) => sub.status === "ACTIVE");
  }

  // Get shop settings including custom CSS
  let shopSettings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!shopSettings) {
    shopSettings = await prisma.shopSettings.create({
      data: {
        shop: session.shop,
        customCss: "",
      },
    });
  }

  return json({
    shop: session.shop,
    currentPlan: shopPlan.plan,
    quizCount,
    quizLimit: getQuizLimit(shopPlan.plan),
    activeSubscription,
    customCss: shopSettings.customCss || "",
    plans: PLANS,
  });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const _action = formData.get("_action");
  const { billing, session } = await authenticate.admin(request);

  try {
    if (_action === "saveCustomCss") {
      const customCss = formData.get("customCss");

      await prisma.shopSettings.upsert({
        where: { shop: session.shop },
        update: { customCss },
        create: {
          shop: session.shop,
          customCss,
        },
      });

      return json({ customCssSaved: true });

    } else if (_action === "upgradePlan") {
      const targetPlan = formData.get("targetPlan");

      // Skip billing for staging/dev
      const skipBilling = process.env.SKIP_BILLING === 'true';
      if (skipBilling) {
        // Just update the plan in database for testing
        await prisma.shopPlan.upsert({
          where: { shop: session.shop },
          update: { plan: targetPlan },
          create: { shop: session.shop, plan: targetPlan },
        });
        return redirect("/app/settings");
      }

      const isTest = process.env.BILLING_TEST_MODE !== 'false';
      const planName = targetPlan === "starter" ? PLAN_STARTER : PLAN_GROWTH;

      // Request billing - this will redirect to Shopify payment page
      await billing.request({
        plan: planName,
        isTest,
        returnUrl: `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/settings?upgraded=true`,
      });

    } else if (_action === "downgradePlan") {
      const targetPlan = formData.get("targetPlan");

      // For downgrade, we need to cancel the current subscription
      // The webhook will handle updating the plan when subscription is cancelled
      // For now, just update the database - merchant manages subscription in Shopify Admin
      await prisma.shopPlan.upsert({
        where: { shop: session.shop },
        update: { plan: targetPlan },
        create: { shop: session.shop, plan: targetPlan },
      });

      return json({ planUpdated: true, newPlan: targetPlan });
    }
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("Settings action error:", error);
    return json({ error: error.message || "An error occurred" }, { status: 500 });
  }

  return redirect("/app/settings");
};

export default function BillingPage() {
  const {
    shop,
    currentPlan,
    quizCount,
    quizLimit,
    activeSubscription,
    customCss,
    plans
  } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [showCssSavedToast, setShowCssSavedToast] = useState(false);
  const [showPlanUpdatedToast, setShowPlanUpdatedToast] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [customCssValue, setCustomCssValue] = useState(customCss);

  useEffect(() => {
    setCustomCssValue(customCss);
  }, [customCss]);

  useEffect(() => {
    if (actionData?.customCssSaved) {
      setShowCssSavedToast(true);
    }
    if (actionData?.planUpdated) {
      setShowPlanUpdatedToast(true);
    }
    if (actionData?.error) {
      setShowErrorBanner(true);
    }
  }, [actionData]);

  const isSubmitting = navigation.state === "submitting";

  const toggleCssSavedToast = useCallback(() => setShowCssSavedToast(false), []);
  const togglePlanUpdatedToast = useCallback(() => setShowPlanUpdatedToast(false), []);

  const handlePlanChange = (targetPlan) => {
    if (targetPlan === currentPlan) return;

    const planOrder = { free: 0, starter: 1, growth: 2 };
    const isUpgrade = planOrder[targetPlan] > planOrder[currentPlan];

    submit(
      {
        _action: isUpgrade ? "upgradePlan" : "downgradePlan",
        targetPlan
      },
      { method: "post" }
    );
  };

  // Calculate usage percentage for progress bar
  const usagePercentage = quizLimit === Infinity ? 0 : Math.min((quizCount / quizLimit) * 100, 100);

  // Build plan cards with current state
  const planCards = [
    {
      key: "free",
      ...plans.free,
      isCurrent: currentPlan === "free",
      buttonText: currentPlan === "free" ? "Current plan" : "Downgrade to Free",
      buttonDisabled: currentPlan === "free",
      buttonTone: currentPlan === "free" ? undefined : "critical",
    },
    {
      key: "starter",
      ...plans.starter,
      isCurrent: currentPlan === "starter",
      buttonText: currentPlan === "starter" ? "Current plan" :
                  currentPlan === "growth" ? "Downgrade to Starter" : "Upgrade to Starter",
      buttonDisabled: currentPlan === "starter",
      buttonTone: currentPlan === "starter" ? undefined :
                  currentPlan === "growth" ? "critical" : undefined,
      buttonVariant: currentPlan === "free" ? "primary" : undefined,
    },
    {
      key: "growth",
      ...plans.growth,
      isCurrent: currentPlan === "growth",
      buttonText: currentPlan === "growth" ? "Current plan" : "Upgrade to Growth",
      buttonDisabled: currentPlan === "growth",
      buttonVariant: currentPlan !== "growth" ? "primary" : undefined,
    },
  ];

  return (
    <Frame>
      <Page fullWidth title="Billing & Settings">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {/* Error Banner */}
              {showErrorBanner && actionData?.error && (
                <Banner
                  title="Error"
                  tone="critical"
                  onDismiss={() => setShowErrorBanner(false)}
                >
                  <Text as="p">{actionData.error}</Text>
                </Banner>
              )}

              {/* Current Plan Overview */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="200">
                      <InlineStack gap="300" blockAlign="center">
                        <Text as="h2" variant="headingLg">
                          Your Plan
                        </Text>
                        <Badge tone={currentPlan === "free" ? "info" : "success"} size="large">
                          {plans[currentPlan]?.name || "Free"}
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                    <Box>
                      <Text as="p" variant="heading2xl" alignment="end">
                        ${plans[currentPlan]?.price || 0}
                      </Text>
                      <Text as="p" tone="subdued" alignment="end">
                        {plans[currentPlan]?.price > 0 ? "per month" : "forever free"}
                      </Text>
                    </Box>
                  </InlineStack>

                  <Divider />

                  {/* Usage Stats - only show for limited plans */}
                  {quizLimit !== Infinity && (
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodyMd">Quiz usage</Text>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {quizCount} / {quizLimit}
                        </Text>
                      </InlineStack>
                      <ProgressBar
                        progress={usagePercentage}
                        tone={usagePercentage >= 100 ? "critical" : usagePercentage >= 80 ? "warning" : "primary"}
                        size="small"
                      />
                      {quizCount >= quizLimit && (
                        <Banner tone="warning">
                          <Text as="p">You've reached your quiz limit. Upgrade to create more quizzes.</Text>
                        </Banner>
                      )}
                    </BlockStack>
                  )}

                  {/* Subscription Details (if on paid plan) */}
                  {activeSubscription && (
                    <>
                      <Divider />
                      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                        <Box>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" tone="subdued">Status</Text>
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={CheckCircleIcon} tone="success" />
                              <Text as="p" variant="bodyMd" fontWeight="semibold">Active</Text>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" tone="subdued">Billing Cycle</Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">Monthly</Text>
                          </BlockStack>
                        </Box>
                        {activeSubscription.currentPeriodEnd && (
                          <Box>
                            <BlockStack gap="100">
                              <Text as="p" variant="bodySm" tone="subdued">Next Billing</Text>
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </Text>
                            </BlockStack>
                          </Box>
                        )}
                      </InlineGrid>
                    </>
                  )}
                </BlockStack>
              </Card>

              {/* Plan Selection */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">
                    Available Plans
                  </Text>
                  <Text as="p" tone="subdued">
                    Choose the plan that best fits your needs
                  </Text>

                  <Divider />

                  <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
                    {planCards.map((plan) => (
                      <Box
                        key={plan.key}
                        padding="400"
                        background={plan.isCurrent ? "bg-surface-selected" : "bg-surface"}
                        borderRadius="200"
                        borderWidth="025"
                        borderColor={plan.isCurrent ? "border-success" : "border"}
                      >
                        <BlockStack gap="300">
                          {/* Plan Header */}
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">{plan.name}</Text>
                            {plan.isCurrent && (
                              <Badge tone="success">Current</Badge>
                            )}
                          </InlineStack>

                          {/* Price */}
                          <BlockStack gap="100">
                            <InlineStack gap="100" blockAlign="baseline">
                              <Text as="span" variant="heading2xl">${plan.price}</Text>
                              {plan.price > 0 && (
                                <Text as="span" variant="bodySm" tone="subdued">/mo</Text>
                              )}
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {plan.price === 0 ? "Forever free" : "Billed monthly"}
                            </Text>
                          </BlockStack>

                          <Divider />

                          {/* Features */}
                          <BlockStack gap="200">
                            {plan.features.map((feature, index) => (
                              <InlineStack key={index} gap="200" blockAlign="start">
                                <Box minWidth="16px">
                                  <Icon source={CheckIcon} tone="success" />
                                </Box>
                                <Text as="span" variant="bodySm">{feature}</Text>
                              </InlineStack>
                            ))}
                          </BlockStack>

                          {/* Action Button */}
                          <Box paddingBlockStart="200">
                            <Button
                              variant={plan.buttonVariant}
                              tone={plan.buttonTone}
                              disabled={plan.buttonDisabled}
                              onClick={() => handlePlanChange(plan.key)}
                              fullWidth
                              loading={isSubmitting}
                            >
                              {plan.buttonText}
                            </Button>
                          </Box>
                        </BlockStack>
                      </Box>
                    ))}
                  </InlineGrid>

                  {/* Manage Subscription Link */}
                  {currentPlan !== "free" && (
                    <>
                      <Divider />
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued">
                          To cancel your subscription or update payment methods, visit your Shopify Admin billing settings.
                        </Text>
                        <InlineStack align="start">
                          <Button
                            onClick={() => {
                              window.open(`https://${shop}/admin/settings/billing`, '_top');
                            }}
                            variant="plain"
                          >
                            Manage in Shopify Admin
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </>
                  )}
                </BlockStack>
              </Card>

              {/* Custom CSS Section */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">
                      Custom CSS Styling
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Customize the appearance of your quiz widget to match your store's design.
                    </Text>
                  </BlockStack>

                  <Divider />

                  <Form method="post">
                    <input type="hidden" name="_action" value="saveCustomCss" />
                    <BlockStack gap="400">
                      <TextField
                        label="Custom CSS"
                        value={customCssValue}
                        onChange={setCustomCssValue}
                        multiline={8}
                        autoComplete="off"
                        helpText="Add CSS rules to style your quiz widget."
                        name="customCss"
                      />

                      <InlineStack align="end">
                        <Button
                          variant="primary"
                          submit
                          loading={isSubmitting}
                        >
                          Save Custom CSS
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>

                  <Divider />

                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      Available CSS Classes
                    </Text>
                    <Box>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <Text as="span" fontWeight="semibold">.turbo-quiz-widget</Text> - Main quiz wrapper
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <Text as="span" fontWeight="semibold">.turbo-quiz-question-text</Text> - Question text
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <Text as="span" fontWeight="semibold">.turbo-quiz-answer-btn</Text> - Answer buttons
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <Text as="span" fontWeight="semibold">.turbo-quiz-result</Text> - Results section
                        </Text>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Setup Instructions */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">
                    How to Add Quiz to Your Store
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Follow these steps to display your quiz on your storefront
                  </Text>

                  <Divider />

                  <BlockStack gap="400">
                    {/* Step 1 */}
                    <BlockStack gap="200">
                      <Box width="fit-content">
                        <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                          <Text as="span" variant="bodySm" fontWeight="semibold">Step 1</Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Create a quiz</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Go to the Dashboard and create a quiz with your questions and answers
                      </Text>
                      <InlineStack align="start">
                        <Button onClick={() => navigate("/app")}>Go to Dashboard</Button>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    {/* Step 2 */}
                    <BlockStack gap="200">
                      <Box width="fit-content">
                        <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                          <Text as="span" variant="bodySm" fontWeight="semibold">Step 2</Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Copy your Quiz ID</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Each quiz has a unique ID shown on the quiz details page.
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Step 3 */}
                    <BlockStack gap="200">
                      <Box width="fit-content">
                        <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                          <Text as="span" variant="bodySm" fontWeight="semibold">Step 3</Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Add Quiz Widget block to your theme</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Open the Theme Editor and add the "Quiz Widget" app block
                      </Text>
                      <InlineStack align="start">
                        <Button
                          onClick={() => {
                            window.open('https://admin.shopify.com/themes/current/editor', '_top');
                          }}
                          variant="primary"
                        >
                          Open Theme Editor
                        </Button>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    {/* Step 4 */}
                    <BlockStack gap="200">
                      <Box width="fit-content">
                        <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                          <Text as="span" variant="bodySm" fontWeight="semibold">Step 4</Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Paste the Quiz ID in block settings</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        In the Theme Editor, find the Quiz Widget block settings and enter your Quiz ID
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Screenshot */}
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Visual Guide</Text>
                      <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                        <BlockStack gap="200" inlineAlign="center">
                          <div onClick={() => setShowImageModal(true)} style={{ cursor: "pointer" }}>
                            <img
                              src="/quiz-setup-guide.jpg"
                              alt="Setup instructions - Click to enlarge"
                              style={{
                                width: "100%",
                                maxWidth: "600px",
                                height: "auto",
                                border: "1px solid #e0e0e0",
                                borderRadius: "8px",
                              }}
                            />
                          </div>
                          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                            Click image to enlarge
                          </Text>
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" align="start" blockAlign="start">
                    <Box minWidth="20px">
                      <Icon source={ChatIcon} tone="base" />
                    </Box>
                    <Text as="h3" variant="headingMd">Help & Support</Text>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      Need help with setup or have questions?
                    </Text>
                    <Box paddingBlockStart="200">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">Contact us:</Text>
                        <Text as="p" variant="bodyLg" fontWeight="bold">info@quizza.app</Text>
                      </BlockStack>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {showCssSavedToast && (
          <Toast
            content="Custom CSS saved successfully"
            onDismiss={toggleCssSavedToast}
            duration={4500}
          />
        )}

        {showPlanUpdatedToast && (
          <Toast
            content={`Plan updated to ${actionData?.newPlan || 'new plan'}`}
            onDismiss={togglePlanUpdatedToast}
            duration={4500}
          />
        )}

        <Modal
          open={showImageModal}
          onClose={() => setShowImageModal(false)}
          title="Setup Guide"
          size="large"
        >
          <Modal.Section>
            <img
              src="/quiz-setup-guide.jpg"
              alt="Setup instructions"
              style={{ width: "100%", height: "auto" }}
            />
          </Modal.Section>
        </Modal>
      </Page>
    </Frame>
  );
}
