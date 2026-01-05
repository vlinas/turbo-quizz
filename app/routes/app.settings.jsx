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
  ChatIcon,
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

      // Skip billing entirely for staging/dev apps (non-public distribution)
      const skipBilling = process.env.SKIP_BILLING === 'true';
      if (skipBilling) {
        console.log("[Billing] Skipping billing (SKIP_BILLING=true)");
        return json({ alreadySubscribed: true, skipped: true });
      }

      // Use environment variable to control test mode
      // Defaults to true if not set (safe for development)
      const isTest = process.env.BILLING_TEST_MODE !== 'false';

      // Use billing.require() with onFailure pattern for Manual Pricing
      // Don't wrap in try-catch - let billing.require handle the flow
      await billing.require({
        plans: ["premium"],
        onFailure: async () => {
          const response = await billing.request({
            plan: "premium",
            isTest,
            returnUrl: `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/settings?subscribed=true`,
          });
          return response;
        },
      });

      // If we get here, user already has subscription
      return json({ alreadySubscribed: true });
    }
  } catch (error) {
    // If it's a Response object (redirect), re-throw it so Remix handles it
    if (error instanceof Response) {
      throw error;
    }
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
  }, [actionData]);

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

              {/* Subscription Status */}
              <Card>
                <BlockStack gap="500">
                  {/* Header Section */}
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="200">
                      <InlineStack gap="300" blockAlign="center">
                        <Text as="h2" variant="headingXl">
                          Premium Plan
                        </Text>
                        <Badge tone="success" size="large">Active</Badge>
                      </InlineStack>
                      <Text as="p" variant="bodyLg" tone="subdued">
                        {activePlan?.trialDays ? `Includes ${activePlan.trialDays}-day free trial` : 'You have full access to all Premium features'}
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
                        <InlineStack gap="200" blockAlign="start" align="start">
                          <Box minWidth="20px">
                            <Icon source={CheckCircleIcon} tone="success" />
                          </Box>
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
                    {activePlan?.currentPeriodEnd && (
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
                      Premium Features
                    </Text>
                    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                      {[
                        "Unlimited quizzes",
                        "Unlimited questions & answers",
                        "Order attribution tracking",
                        "Revenue analytics",
                        "Answer statistics & insights",
                        "Priority email support"
                      ].map((feature, index) => (
                        <InlineStack key={index} gap="300" blockAlign="start" wrap={false} align="start">
                          <Box minWidth="20px">
                            <Icon source={CheckCircleIcon} tone="success" />
                          </Box>
                          <Text as="span">{feature}</Text>
                        </InlineStack>
                      ))}
                    </InlineGrid>
                  </BlockStack>

                  <Divider />

                  {/* Manage Section */}
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd">
                      Manage Subscription
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      To cancel or modify your subscription, please visit your Shopify Admin billing settings.
                    </Text>
                    <InlineStack align="start">
                      <Button
                        onClick={() => {
                          window.open(`https://${shop}/admin/settings/billing`, '_top');
                        }}
                        variant="secondary"
                      >
                        Manage in Shopify Admin
                      </Button>
                    </InlineStack>
                  </BlockStack>
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
              {/* Help & Support */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" align="start" blockAlign="start">
                    <Box minWidth="20px">
                      <Icon source={ChatIcon} tone="base" />
                    </Box>
                    <Text as="h3" variant="headingMd">
                      Help & Support
                    </Text>
                  </InlineStack>
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
                          info@quizza.app
                        </Text>
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
