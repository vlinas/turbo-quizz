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
  Badge,
  Toast,
  Frame,
  Icon,
  Divider,
  Box,
} from "@shopify/polaris";
import {
  CheckIcon,
  StarFilledIcon,
  CheckCircleIcon,
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

  useEffect(() => {
    if (actionData?.subscriptionCancelled) {
      setShowCancelToast(true);
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
      <Page title="Billing" narrowWidth>
        <Layout>
          <Layout.Section>
            <BlockStack gap="600">
              {/* Current Plan Status */}
              {isSubscribed ? (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h2" variant="headingLg">
                            Pro Plan
                          </Text>
                          <Badge tone="success">
                            <InlineStack gap="100" blockAlign="center">
                              <Icon source={StarFilledIcon} />
                              Active
                            </InlineStack>
                          </Badge>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          You're on the Pro plan with unlimited access
                        </Text>
                        {activePlan.currentPeriodEnd && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Next billing: {new Date(activePlan.currentPeriodEnd).toLocaleDateString()}
                          </Text>
                        )}
                      </BlockStack>
                      <Text as="p" variant="heading2xl">
                        $14.99<Text as="span" tone="subdued">/mo</Text>
                      </Text>
                    </InlineStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">
                        Your Plan Includes
                      </Text>
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Unlimited quizzes</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Unlimited questions per quiz</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Order attribution tracking</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Revenue analytics</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <Text as="span">Priority support</Text>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>

                    <Divider />

                    <Form method="post">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" tone="subdued">
                          Need to make changes?
                        </Text>
                        <Button
                          tone="critical"
                          submit
                          name="_action"
                          value="cancelSubscription"
                          loading={isSubmitting}
                        >
                          Cancel Subscription
                        </Button>
                      </InlineStack>
                    </Form>
                  </BlockStack>
                </Card>
              ) : (
                <Card>
                  <BlockStack gap="500">
                    {/* Header */}
                    <BlockStack gap="300" inlineAlign="center">
                      <Box paddingBlockEnd="200">
                        <InlineStack gap="100">
                          <Icon source={StarFilledIcon} tone="warning" />
                          <Icon source={StarFilledIcon} tone="warning" />
                          <Icon source={StarFilledIcon} tone="warning" />
                          <Icon source={StarFilledIcon} tone="warning" />
                          <Icon source={StarFilledIcon} tone="warning" />
                        </InlineStack>
                      </Box>
                      <Text as="h1" variant="heading2xl" alignment="center">
                        Upgrade to Pro
                      </Text>
                      <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                        Create unlimited quizzes and grow your revenue with advanced analytics
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Pricing */}
                    <BlockStack gap="400" inlineAlign="center">
                      <InlineStack gap="100" blockAlign="baseline">
                        <Text as="p" variant="heading3xl">
                          $14.99
                        </Text>
                        <Text as="span" variant="headingLg" tone="subdued">
                          /month
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    {/* Features */}
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingMd">
                        What's included:
                      </Text>
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="span">Unlimited quizzes</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="span">Unlimited questions & answers</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="span">Product & collection recommendations</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="span">Order attribution tracking</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="span">Revenue analytics dashboard</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="span">Answer statistics & insights</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CheckIcon} tone="success" />
                          <Text as="span">Priority email support</Text>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>

                    {/* CTA */}
                    <Form method="post">
                      <BlockStack gap="300">
                        <Button
                          variant="primary"
                          size="large"
                          fullWidth
                          submit
                          name="_action"
                          value="startSubscription"
                          loading={isSubmitting}
                        >
                          Upgrade Now
                        </Button>
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          Cancel anytime • No long-term commitment
                        </Text>
                      </BlockStack>
                    </Form>
                  </BlockStack>
                </Card>
              )}

              {/* Free Plan Info */}
              {!isSubscribed && (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd">
                      Current: Free Plan
                    </Text>
                    <Text as="p" tone="subdued">
                      You're currently on the free plan with limited features:
                    </Text>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="subdued" />
                        <Text as="span">Up to 3 quizzes</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="subdued" />
                        <Text as="span">Basic analytics</Text>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* App Information */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    App Information
                  </Text>
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
                        App Version
                      </Text>
                      <Text as="p" variant="bodyMd">
                        1.0.0
                      </Text>
                    </Box>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Help */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    Need help?
                  </Text>
                  <Text as="p" tone="subdued">
                    Have questions about billing or need assistance? Contact our support team.
                  </Text>
                  <Button
                    url="mailto:support@turboquiz.app"
                    external
                  >
                    Contact Support
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {showSuccessToast && (
          <Toast
            content="Successfully upgraded to Pro! 🎉"
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
