import { Layout, Page, InlineStack, CalloutCard, Modal, Text, Card } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { getDiscounts, getOders } from "../discount_server";
import { authenticate, BASIC_PLAN, PRO_PLAN } from "../shopify.server";
import { useLoaderData, useSubmit } from "@remix-run/react";

export const action = async ({ request }) => {
  const { billing, admin } = await authenticate.admin(request);
  const result = await admin.graphql(
    `
    #graphql
    query Shop {
      app{
        installation{
          launchUrl
          activeSubscriptions{
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
    }
  `,
    { vaiables: {} }
  );
  const resultJson = await result.json();
  const { launchUrl, activeSubscriptions } = resultJson.data.app.installation;
  // return(activeSubscriptions);
  if (
    activeSubscriptions.length === 0 ||
    !activeSubscriptions ||
    activeSubscriptions.status != "ACTIVE"
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
  else if (activeSubscriptions.status == "ACTIVE")
  {
    const billingCheck = await billing.require({
      plans: [PRO_PLAN],
      onFailure: async () => billing.request({ plan: PRO_PLAN }),
    });

    const subscription = billingCheck.appSubscriptions[0];
    const cancelledSubscription = await billing.cancel({
      subscriptionId: subscription.id,
      isTest: true,
      prorate: true,
    });
  }
  else {
    return activeSubscriptions;
  }
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const result = await admin.graphql(
    `
    #graphql
    query Shop {
      app{
        installation{
          launchUrl
          activeSubscriptions{
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
    }
  `,
    { vaiables: {} }
  );
  const resultJson = await result.json();
  const { activeSubscriptions } = resultJson.data.app.installation;

  let limit = 3;
  let status = false;
  let planid = null;
  if (activeSubscriptions.length > 0) {
    activeSubscriptions.forEach((plan, index) => {
      if (plan.status == "ACTIVE") {
        status = plan.status;
        planid = index;
      }
    });
    console.log("status plan: ", status);
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


export default function Billing() {

  const [modalactive, setModalActive] = useState(false);
  const submit = useSubmit();
  const { data, limit, planid } = useLoaderData();

  const handleUpgradePlan = () => {
    setModalActive(true);
  };

  const handleApprove = () => {
    console.log("approve");
    setModalActive(false);
    submit(1, { replace: true, method: "POST" });
  };

  const handleModalClose = () => setModalActive(false);
  
  return (
    <Page fullWidth={false}>
    <Layout>
      <Layout.Section>
        <InlineStack gap="400" wrap={false} blockAlign="start" align="center">

        {planid == null ? (

           <CalloutCard
            title="You are on Free Plan"
            illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
            primaryAction={{
              content: "Upgrade $14.99/month",
              url: "#",
              onAction: handleUpgradePlan,
            }}
          >
            <p></p>
            <p>Upgrade to unlock all features:</p>

            <p>- Create unlimited quizzes</p>
            <p>- For Basic and Shopify PLUS merchants</p>
            <p>- Support with Live Chat during business hours</p>
            <p></p>
            {/* <p>Get started with three quizzes at no charges</p> */}
          </CalloutCard>
        ) : (

          <CalloutCard
            title="You are on Paid Plan"
            illustration="https://cdn.shopify.com/s/assets/admin/checkout/settings-customizecart-705f57c725ac05be5a34ec20c05b94298cb8afd10aac7bd9c7ad02030f48cfa0.svg"
            primaryAction={{
              content: "Downgrade",
              url: "#",
              onAction: handleUpgradePlan,
            }}
          >
            <p></p>
          </CalloutCard>
        
        )}
        </InlineStack>
      </Layout.Section>
    </Layout>

    <Modal
        open={modalactive}
        onClose={handleModalClose}
        title="Approve your plan"
        primaryAction={{
          content: "Approve charges",
          onAction: handleApprove,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleModalClose,
          },
        ]}
      >
        <Modal.Section>
          <Text variant="bodyMd" as="p">
            You have exceeded the number of free quizzes. In order to
            create additional quizzes you need to approve the monthly charges. You
            will be redirected to Shopify to approve charges of{" "}
            <strong>$14.99 USD</strong> per month.
          </Text>
        </Modal.Section>
      </Modal>

    </Page>
  );
}
