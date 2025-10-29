import { useEffect, useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDiscounts } from "../discount_server";
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
} from "@shopify/polaris";
import {
  CheckIcon,
  StarFilledIcon,
} from "@shopify/polaris-icons";
import { authenticate, PRO_PLAN } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
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
    { vaiables: {} }
  );
  const resultJson = await result.json();
  const { activeSubscriptions } = resultJson.data.app.installation;

  let limit = 1;
  let status = false;
  let planid = null;
  if (activeSubscriptions.length > 0) {
    activeSubscriptions.forEach((plan, index) => {
      if (plan.status == "ACTIVE") {
        status = plan.status;
        planid = index;
      }
    });
    if (status == "ACTIVE") {
      limit = -1;
    }
  }
  let data = await getDiscounts(session.shop);
  let response = {
    data: data,
    limit: limit,
    plan: activeSubscriptions.length > 0 ? activeSubscriptions : [],
    planid: planid,
  };
  return response;
};

export const action = async ({ request }) => {
  let { _action } = Object.fromEntries(await request.formData());
  const { billing } = await authenticate.admin(request);

  if (_action === "startSubscription") {
    await billing.require({
      plans: [PRO_PLAN],
      onFailure: async () => {
        const response = await billing.request({
          plan: PRO_PLAN,
          isTest: true,
          returnUrl: "",
        });
        return response;
      },
    });
    return json({ alreadySubscribed: true });
  } else if (_action === "cancelSubscription") {
    const billingCheck = await billing.require({
      plans: [PRO_PLAN],
      onFailure: async () => billing.request({ plan: PRO_PLAN }),
    });

    const subscription = billingCheck.appSubscriptions[0];
    await billing.cancel({
      subscriptionId: subscription.id,
      isTest: false,
      prorate: true,
    });
    return json({ subscriptionCancelled: true }), redirect("/app");
  }
  return redirect("/app");
};

export default function BillingPage() {
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [subscriptionCancelled, setSubscriptionCancelled] = useState(false);
  const actionData = useActionData();

  useEffect(() => {
    if (actionData?.alreadySubscribed) {
      setAlreadySubscribed(actionData?.alreadySubscribed);
    }
    if (actionData?.subscriptionCancelled) {
      setSubscriptionCancelled(actionData?.subscriptionCancelled);
    }
  }, [actionData]);

  const { planid } = useLoaderData();
  const isSubscribed = planid !== null;

  const toggleActive = useCallback(() => {
    setSubscriptionCancelled(false);
    setAlreadySubscribed(false);
  }, []);

  return (
    <Page title="Pricing" narrowWidth>
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
                        <Badge tone="success">Active</Badge>
                      </InlineStack>
                      <Text as="p" tone="subdued">
                        You're on the Pro plan with unlimited access
                      </Text>
                    </BlockStack>
                    <Text as="p" variant="heading2xl">
                      $14.99<Text as="span" tone="subdued">/mo</Text>
                    </Text>
                  </InlineStack>

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
                      Unlock unlimited discount codes and grow your sales
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
                        <Text as="span">Unlimited discount code sets</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="span">Unlimited codes per set</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="span">Priority live chat support</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="span">Revenue tracking & analytics</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="span">Advanced button customization</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="span">Scheduled discount campaigns</Text>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="span">Collection & product targeting</Text>
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

            {/* Help */}
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Need help?
                </Text>
                <Text as="p" tone="subdued">
                  Email us at{" "}
                  <a
                    href="mailto:info@clickxapp.com"
                    style={{ color: "var(--p-color-text-brand)" }}
                  >
                    info@clickxapp.com
                  </a>
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Frame>
        {alreadySubscribed && (
          <Toast
            content="You're already subscribed to Pro!"
            onDismiss={toggleActive}
          />
        )}
        {subscriptionCancelled && (
          <Toast
            content="Subscription cancelled successfully"
            onDismiss={toggleActive}
          />
        )}
      </Frame>
    </Page>
  );
}
