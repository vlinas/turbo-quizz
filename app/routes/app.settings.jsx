import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Banner,
  Box,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  StarFilledIcon,
} from "@shopify/polaris-icons";
import { authenticate, PRO_PLAN } from "../shopify.server";

export const action = async ({ request }) => {
  const { billing, admin } = await authenticate.admin(request);

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
  const { launchUrl, activeSubscriptions } = resultJson.data.app.installation;

  if (
    activeSubscriptions.length === 0 ||
    !activeSubscriptions ||
    activeSubscriptions.status !== "ACTIVE"
  ) {
    await billing.require({
      plans: [PRO_PLAN],
      isTest: true,
      onFailure: async () =>
        billing.request({
          plan: PRO_PLAN,
          isTest: true,
          returnUrl: launchUrl,
        }),
    });
  }

  return json({ success: true });
};

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

export default function Settings() {
  const { shop, activePlan } = useLoaderData();
  const submit = useSubmit();
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgrade = useCallback(() => {
    setIsUpgrading(true);
    submit({}, { method: "post" });
  }, [submit]);

  const isProPlan = activePlan && activePlan.status === "ACTIVE";
  const planName = isProPlan ? "Pro" : "Free";
  const quizLimit = isProPlan ? "Unlimited" : "3";

  return (
    <Page
      title="Settings"
      subtitle="Manage your plan and app settings"
    >
      <Layout>
        <Layout.Section>
          {/* Current Plan */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingLg">
                      Current Plan: {planName}
                    </Text>
                    {isProPlan && (
                      <Badge tone="success">
                        <InlineStack gap="100" blockAlign="center">
                          <Icon source={StarFilledIcon} />
                          Active
                        </InlineStack>
                      </Badge>
                    )}
                  </InlineStack>
                  {isProPlan && activePlan.currentPeriodEnd && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Next billing date: {new Date(activePlan.currentPeriodEnd).toLocaleDateString()}
                    </Text>
                  )}
                </BlockStack>
                {!isProPlan && (
                  <Button
                    variant="primary"
                    onClick={handleUpgrade}
                    loading={isUpgrading}
                  >
                    Upgrade to Pro
                  </Button>
                )}
              </InlineStack>

              <Divider />

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Plan Features
                </Text>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p">{quizLimit} quizzes</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p">Unlimited questions per quiz</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p">Analytics dashboard</Text>
                  </InlineStack>
                  {isProPlan && (
                    <>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckCircleIcon} tone="success" />
                        <Text as="p">Priority support</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckCircleIcon} tone="success" />
                        <Text as="p">Custom quiz styling</Text>
                      </InlineStack>
                    </>
                  )}
                </BlockStack>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Upgrade Banner */}
          {!isProPlan && (
            <Banner>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Upgrade to Pro for $14.99/month
                </Text>
                <Text as="p">
                  Get unlimited quizzes, priority support, and custom styling options.
                </Text>
                <Box>
                  <Button onClick={handleUpgrade} loading={isUpgrading}>
                    Upgrade Now
                  </Button>
                </Box>
              </BlockStack>
            </Banner>
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
        </Layout.Section>

        <Layout.Section variant="oneThird">
          {/* Support Card */}
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">
                Need Help?
              </Text>
              <Text as="p" variant="bodySm">
                Our support team is here to help you get the most out of Turbo Quiz.
              </Text>
              <Button url="mailto:support@example.com" external>
                Contact Support
              </Button>
            </BlockStack>
          </Card>

          {/* Resources Card */}
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">
                Resources
              </Text>
              <BlockStack gap="200">
                <Button url="#" external plain>
                  Documentation
                </Button>
                <Button url="#" external plain>
                  Video Tutorials
                </Button>
                <Button url="#" external plain>
                  Best Practices
                </Button>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Pro Features Teaser */}
          {!isProPlan && (
            <Card background="bg-fill-info-secondary">
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={StarFilledIcon} tone="info" />
                  <Text as="h3" variant="headingSm">
                    Pro Features
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodySm">
                  Unlock unlimited quizzes, advanced analytics, custom styling, and priority support.
                </Text>
                <Button onClick={handleUpgrade} loading={isUpgrading}>
                  Upgrade to Pro
                </Button>
              </BlockStack>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
