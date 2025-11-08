import { useEffect, useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
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
} from "@shopify/polaris";
import {
  CheckIcon,
  StarFilledIcon,
  CheckCircleIcon,
  CashDollarIcon,
  ChartVerticalIcon,
  PlayIcon,
} from "@shopify/polaris-icons";
import { authenticate, PRO_PLAN } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Get subscription info
  const result = await admin.graphql(
    `#graphql
    query Shop {
      app {
        installation {
          launchUrl
          activeSubscriptions {
            id
            name
            createdAt
            returnUrl
            status
            currentPeriodEnd
            trialDays
          }
        }
      }
    }`,
    { variables: {} }
  );

  const resultJson = await result.json();
  const { activeSubscriptions } = resultJson.data.app.installation;

  let activePlan = null;
  if (activeSubscriptions.length > 0) {
    activePlan = activeSubscriptions.find((plan) => plan.status === "ACTIVE");
  }

  return json({
    shop: session.shop,
    activePlan,
  });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const _action = formData.get("_action");
  const { billing, admin } = await authenticate.admin(request);

  try {
    if (_action === "startSubscription") {
      // Get the app installation launch URL for return
      const result = await admin.graphql(
        `#graphql
        query Shop {
          app {
            installation {
              launchUrl
            }
          }
        }`,
        { variables: {} }
      );
      const resultJson = await result.json();
      const launchUrl = resultJson.data.app.installation.launchUrl;

      // Request billing
      const billingResponse = await billing.request({
        plan: PRO_PLAN,
        isTest: true,
        returnUrl: `${launchUrl}/billing?upgrade=success`,
      });

      // Redirect to confirmation URL
      return redirect(billingResponse.confirmationUrl);

    } else if (_action === "cancelSubscription") {
      const billingCheck = await billing.require({
        plans: [PRO_PLAN],
        onFailure: async () => {
          return json({ error: "No active subscription found" }, { status: 400 });
        },
      });

      const subscription = billingCheck.appSubscriptions[0];
      await billing.cancel({
        subscriptionId: subscription.id,
        isTest: true,
        prorate: true,
      });

      return json({ subscriptionCancelled: true });
    }
  } catch (error) {
    console.error("Billing action error:", error);
    return json({ error: error.message || "An error occurred" }, { status: 500 });
  }

  return redirect("/app/billing");
};

export default function BillingPage() {
  const { shop, activePlan } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showCancelToast, setShowCancelToast] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);

  useEffect(() => {
    if (actionData?.subscriptionCancelled) {
      setShowCancelToast(true);
    }

    if (actionData?.error) {
      setShowErrorBanner(true);
    }

    // Check URL params for upgrade success
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      setShowSuccessToast(true);
      // Clean up URL
      window.history.replaceState({}, '', '/app/billing');
    }
  }, [actionData]);

  const isSubscribed = activePlan && activePlan.status === "ACTIVE";
  const isSubmitting = navigation.state === "submitting";

  const toggleSuccessToast = useCallback(() => setShowSuccessToast(false), []);
  const toggleCancelToast = useCallback(() => setShowCancelToast(false), []);

  return (
    <Frame>
      <Page fullWidth title="Plans & Billing">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {/* Error Banner */}
              {showErrorBanner && actionData?.error && (
                <Banner
                  title="Billing unavailable"
                  tone="warning"
                  onDismiss={() => setShowErrorBanner(false)}
                >
                  <Text as="p">
                    The billing system is currently not available for this app. This typically happens with custom or development apps.
                    {" "}If you need Pro features, please contact support.
                  </Text>
                </Banner>
              )}

              {/* Current Plan Status - Full Width */}
              {isSubscribed ? (
                <Card>
                  <BlockStack gap="500">
                    {/* Header Section */}
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="200">
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={StarFilledIcon} tone="warning" />
                          <Text as="h2" variant="headingXl">
                            Pro Plan
                          </Text>
                          <Badge tone="success" size="large">Active</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodyLg" tone="subdued">
                          You have full access to all Pro features
                        </Text>
                      </BlockStack>
                      <Box>
                        <Text as="p" variant="heading2xl" alignment="end">
                          $14.99
                        </Text>
                        <Text as="p" tone="subdued" alignment="end">
                          per month
                        </Text>
                      </Box>
                    </InlineStack>

                    <Divider />

                    {/* Plan Details Grid */}
                    <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                      <Box>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Status
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={CheckCircleIcon} tone="success" />
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              Active Subscription
                            </Text>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                      <Box>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Billing Cycle
                          </Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Monthly
                          </Text>
                        </BlockStack>
                      </Box>
                      {activePlan.currentPeriodEnd && (
                        <Box>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Next Billing Date
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {new Date(activePlan.currentPeriodEnd).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Text>
                          </BlockStack>
                        </Box>
                      )}
                    </InlineGrid>

                    <Divider />

                    {/* Features Section */}
                    <BlockStack gap="400">
                      <Text as="h3" variant="headingMd">
                        Your Pro Features
                      </Text>
                      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Unlimited quizzes</Text>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Unlimited questions & answers</Text>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Product recommendations</Text>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Collection recommendations</Text>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Order attribution tracking</Text>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Revenue analytics</Text>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Answer statistics & insights</Text>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Priority email support</Text>
                        </InlineStack>
                      </InlineGrid>
                    </BlockStack>

                    <Divider />

                    {/* Manage Section */}
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd">
                          Need to make changes to your plan?
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Cancel anytime with no long-term commitment
                        </Text>
                      </BlockStack>
                      <Form method="post">
                        <Button
                          tone="critical"
                          submit
                          name="_action"
                          value="cancelSubscription"
                          loading={isSubmitting}
                        >
                          Cancel Subscription
                        </Button>
                      </Form>
                    </InlineStack>
                  </BlockStack>
                </Card>
              ) : (
                <>
                  {/* Upgrade to Pro Section */}
                  <Card>
                    <BlockStack gap="500">
                      {/* Hero Section */}
                      <Box paddingBlockEnd="400">
                        <BlockStack gap="400" inlineAlign="center">
                          <InlineStack gap="200">
                            <Icon source={StarFilledIcon} tone="warning" />
                            <Icon source={StarFilledIcon} tone="warning" />
                            <Icon source={StarFilledIcon} tone="warning" />
                            <Icon source={StarFilledIcon} tone="warning" />
                            <Icon source={StarFilledIcon} tone="warning" />
                          </InlineStack>
                          <Text as="h1" variant="heading2xl" alignment="center">
                            Unlock the Full Power of Simple Product Page Quiz
                          </Text>
                          <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                            Create unlimited quizzes, track revenue, and grow your business with advanced analytics
                          </Text>
                        </BlockStack>
                      </Box>

                      <Divider />

                      {/* Pricing Display */}
                      <Box paddingBlockStart="200" paddingBlockEnd="200">
                        <BlockStack gap="300" inlineAlign="center">
                          <InlineStack gap="200" blockAlign="baseline">
                            <Text as="p" variant="heading3xl">
                              $14.99
                            </Text>
                            <Text as="span" variant="headingLg" tone="subdued">
                              /month
                            </Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Billed monthly • Cancel anytime
                          </Text>
                        </BlockStack>
                      </Box>

                      <Divider />

                      {/* Features Grid */}
                      <BlockStack gap="400">
                        <Text as="h3" variant="headingMd" alignment="center">
                          Everything You Need to Succeed
                        </Text>
                        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Unlimited quizzes</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Create as many quizzes as you need
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Unlimited questions</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                No limits on questions or answers
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Product recommendations</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Show personalized product suggestions
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Collection recommendations</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Guide customers to curated collections
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Order attribution</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Track which quizzes drive sales
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Revenue analytics</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                See exactly how much revenue quizzes generate
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Answer statistics</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Understand customer preferences with detailed insights
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300" blockAlign="start">
                            <Icon source={CheckIcon} tone="success" />
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="semibold">Priority support</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Get help when you need it most
                              </Text>
                            </BlockStack>
                          </InlineStack>
                        </InlineGrid>
                      </BlockStack>

                      <Divider />

                      {/* CTA Section */}
                      <BlockStack gap="300">
                        <Form method="post">
                          <InlineStack align="center">
                            <Box width="400px">
                              <Button
                                variant="primary"
                                size="large"
                                fullWidth
                                submit
                                name="_action"
                                value="startSubscription"
                                loading={isSubmitting}
                              >
                                Upgrade to Pro Now
                              </Button>
                            </Box>
                          </InlineStack>
                        </Form>
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          No long-term commitment • Cancel anytime
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </>
              )}
            </BlockStack>
          </Layout.Section>

          {/* Sidebar with App Info */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* App Information */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">
                    App Information
                  </Text>
                  <Divider />
                  <BlockStack gap="300">
                    <Box>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Shop Domain
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {shop}
                      </Text>
                    </Box>
                    <Box>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Current Plan
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {isSubscribed ? "Pro Plan" : "Free Plan"}
                      </Text>
                    </Box>
                    <Box>
                      <Text as="p" variant="bodySm" tone="subdued">
                        App Version
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        1.0.0
                      </Text>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Quick Tips */}
              {!isSubscribed && (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Why Upgrade?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • No limits on quizzes or questions
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • See exactly how much revenue each quiz generates
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • Make data-driven decisions with detailed analytics
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • Get priority support when you need it
                    </Text>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>

        {showSuccessToast && (
          <Toast
            content="Successfully upgraded to Pro!"
            onDismiss={toggleSuccessToast}
            duration={5000}
          />
        )}
        {showCancelToast && (
          <Toast
            content="Subscription cancelled successfully"
            onDismiss={toggleCancelToast}
            duration={4500}
          />
        )}
      </Page>
    </Frame>
  );
}
