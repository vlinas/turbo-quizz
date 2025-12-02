import { useEffect, useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
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
} from "@shopify/polaris";
import {
  StarFilledIcon,
  CheckCircleIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

  // Get shop settings including custom CSS
  let shopSettings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  // Create default settings if they don't exist
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
    activePlan,
    customCss: shopSettings.customCss || "",
  });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const _action = formData.get("_action");
  const { billing, session } = await authenticate.admin(request);

  console.log("[Settings Action] Action type:", _action);

  try {
    if (_action === "saveCustomCss") {
      const customCss = formData.get("customCss");
      console.log("[Settings Action] Saving custom CSS for shop:", session.shop);
      console.log("[Settings Action] CSS length:", customCss?.length || 0);

      // Update or create shop settings
      await prisma.shopSettings.upsert({
        where: { shop: session.shop },
        update: { customCss },
        create: {
          shop: session.shop,
          customCss,
        },
      });

      console.log("[Settings Action] Custom CSS saved successfully, returning JSON response");
      return json({ customCssSaved: true });

    } else if (_action === "startSubscription") {
      console.log("[Billing] Starting subscription with Billing API");

      try {
        // Use billing.request() for Manual Pricing
        const billingResponse = await billing.request({
          plan: "premium",
          isTest: false,
          returnUrl: `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/settings?subscribed=true`,
        });

        console.log("[Billing] Billing response:", billingResponse);

        // Redirect directly to confirmation URL (server-side redirect for embedded apps)
        if (billingResponse && billingResponse.confirmationUrl) {
          return redirect(billingResponse.confirmationUrl);
        } else {
          throw new Error("No confirmation URL returned from billing API");
        }
      } catch (billingError) {
        console.error("[Billing] Billing request failed:", billingError);
        return json({
          error: "billing_unavailable",
          message: billingError.message || "Unable to initiate billing"
        }, { status: 400 });
      }
    } else if (_action === "cancelSubscription") {
      console.log("[Billing] Cancelling subscription");

      try {
        const billingCheck = await billing.require({
          plans: ["premium"],
          onFailure: async () => {
            throw new Error("No active subscription found");
          },
        });

        const subscription = billingCheck.appSubscriptions[0];
        await billing.cancel({
          subscriptionId: subscription.id,
          isTest: false,
          prorate: true,
        });

        console.log("[Billing] Subscription cancelled successfully");
        return json({ subscriptionCancelled: true });
      } catch (cancelError) {
        console.error("[Billing] Cancellation failed:", cancelError);
        return json({
          error: "cancellation_failed",
          message: cancelError.message || "Unable to cancel subscription"
        }, { status: 400 });
      }
    }
  } catch (error) {
    console.error("Settings action error:", error);
    return json({ error: error.message || "An error occurred" }, { status: 500 });
  }

  return redirect("/app/settings");
};

export default function BillingPage() {
  const { shop, activePlan, customCss } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();

  const [showCssSavedToast, setShowCssSavedToast] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [customCssValue, setCustomCssValue] = useState(customCss);

  // Update customCssValue when loader data changes (after save)
  useEffect(() => {
    setCustomCssValue(customCss);
  }, [customCss]);

  useEffect(() => {
    if (actionData?.customCssSaved) {
      setShowCssSavedToast(true);
    }

    if (actionData?.error) {
      setShowErrorBanner(true);
    }

    // Handle subscription cancelled
    if (actionData?.subscriptionCancelled) {
      console.log("[Billing UI] Subscription cancelled, reloading page");
      window.location.reload();
    }
  }, [actionData]);

  const isSubscribed = activePlan && activePlan.status === "ACTIVE";
  const isSubmitting = navigation.state === "submitting";

  const toggleCssSavedToast = useCallback(() => setShowCssSavedToast(false), []);

  return (
    <Frame>
      <Page fullWidth title="Billing & Settings">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {/* Error Banner */}
              {showErrorBanner && actionData?.error && (
                <Banner
                  title="Billing unavailable"
                  tone="info"
                  onDismiss={() => setShowErrorBanner(false)}
                >
                  <BlockStack gap="200">
                    <Text as="p">
                      The billing system is not available for this app. This is normal for:
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • Development/testing apps
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • Custom apps (not distributed via Shopify App Store)
                    </Text>
                    <Text as="p">
                      <strong>Good news:</strong> All premium features are currently enabled for free! You have unlimited access to:
                    </Text>
                    <Text as="p" variant="bodySm">
                      ✓ Unlimited quizzes
                    </Text>
                    <Text as="p" variant="bodySm">
                      ✓ Full analytics & revenue tracking
                    </Text>
                    <Text as="p" variant="bodySm">
                      ✓ All premium features
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      (Billing will be automatically enabled when the app is published to the Shopify App Store)
                    </Text>
                    {actionData.message && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Technical details: {actionData.message}
                      </Text>
                    )}
                  </BlockStack>
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
                            Premium Plan
                          </Text>
                          <Badge tone="success" size="large">Active</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodyLg" tone="subdued">
                          You have full access to all Premium features
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
                          Need to cancel your subscription?
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Cancel anytime with no long-term commitment
                        </Text>
                      </BlockStack>
                      <Form method="post">
                        <input type="hidden" name="_action" value="cancelSubscription" />
                        <Button
                          tone="critical"
                          submit
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
                            Billed monthly • 7-day free trial • Cancel anytime
                          </Text>
                        </BlockStack>
                      </Box>


                      {/* CTA Section */}
                      <BlockStack gap="300">
                        <Form method="post">
                          <input type="hidden" name="_action" value="startSubscription" />
                          <InlineStack align="center">
                            <Box width="400px">
                              <Button
                                variant="primary"
                                size="large"
                                fullWidth
                                submit
                                loading={isSubmitting}
                              >
                                Start 7-Day Free Trial
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

              {/* Custom CSS Section */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">
                      Custom CSS Styling
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Customize the appearance of your quiz widget to match your store's design. Add custom CSS rules that will be applied to the quiz widget on your storefront.
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
                        helpText="Add CSS rules to style your quiz widget. Example: .quiz-container { background: #f5f5f5; border-radius: 8px; }"
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
                          • <Text as="span" fontWeight="semibold">.quiz-container</Text> - Main quiz wrapper
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <Text as="span" fontWeight="semibold">.quiz-question</Text> - Question text
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <Text as="span" fontWeight="semibold">.quiz-answer</Text> - Answer buttons
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          • <Text as="span" fontWeight="semibold">.quiz-results</Text> - Results section
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
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            Step 1
                          </Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Create a quiz
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Go to the Dashboard and create a quiz with your questions and answers
                      </Text>
                      <InlineStack align="start">
                        <Button onClick={() => navigate("/app")}>
                          Go to Dashboard
                        </Button>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    {/* Step 2 */}
                    <BlockStack gap="200">
                      <Box width="fit-content">
                        <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            Step 2
                          </Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Copy your Quiz ID
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Each quiz has a unique ID shown on the quiz details page. You'll need this ID to display the quiz on your store.
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Step 3 */}
                    <BlockStack gap="200">
                      <Box width="fit-content">
                        <Box background="bg-surface-secondary" padding="200" borderRadius="100">
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            Step 3
                          </Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Add Quiz Widget block to your theme
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Open the Theme Editor and add the "Quiz Widget" app block to any page where you want the quiz to appear
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
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            Step 4
                          </Text>
                        </Box>
                      </Box>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Paste the Quiz ID in block settings
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        In the Theme Editor, find the Quiz Widget block settings and enter your Quiz ID
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Screenshot */}
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Visual Guide
                      </Text>
                      <Box
                        background="bg-surface-secondary"
                        padding="400"
                        borderRadius="200"
                      >
                        <BlockStack gap="200" inlineAlign="center">
                          <div
                            onClick={() => setShowImageModal(true)}
                            style={{ cursor: "pointer" }}
                          >
                            <img
                              src="/quiz-setup-guide.jpg"
                              alt="Setup instructions - Click to enlarge"
                              style={{
                                width: "100%",
                                maxWidth: "600px",
                                height: "auto",
                                border: "1px solid #e0e0e0",
                                borderRadius: "8px",
                                transition: "transform 0.2s",
                              }}
                              onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.02)"}
                              onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
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
                        {isSubscribed ? "Premium Plan" : "Trial"}
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

              {/* Help & Support */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">
                    Help & Support
                  </Text>
                  <Divider />
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      Need help with setup or have technical questions?
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Our team is here to help with all technical questions, setup assistance, and feature requests.
                    </Text>
                    <Box paddingBlockStart="200">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Contact us:
                        </Text>
                        <Text as="p" variant="bodyLg" fontWeight="bold">
                          info@linveba.com
                        </Text>
                      </BlockStack>
                    </Box>
                    <Divider />
                    <Text as="p" variant="bodySm" tone="subdued">
                      We typically respond within 24 hours on business days.
                    </Text>
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

        {/* Image Modal */}
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
              style={{
                width: "100%",
                height: "auto",
              }}
            />
          </Modal.Section>
        </Modal>
      </Page>
    </Frame>
  );
}
