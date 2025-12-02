import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { Frame } from "@shopify/polaris";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles }
];

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  // Check installation date for 7-day free trial (no CC required)
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

  const daysSinceInstall = (new Date() - new Date(shopSettings.createdAt)) / (1000 * 60 * 60 * 24);
  const isTrialExpired = daysSinceInstall > 7;

  // Only require billing if trial has expired
  if (isTrialExpired) {
    await billing.require({
      plans: ["premium"],
      onFailure: async () => {
        return await billing.request({
          plan: "premium",
          isTest: false,
          returnUrl: `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/?subscribed=true`,
        });
      },
    });
  }

  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Frame>
        <ui-nav-menu>
          <Link to="/app" rel="home">
            Home
          </Link>
          <Link to="/app/settings">Billing & Settings</Link>
        </ui-nav-menu>
        <Outlet />
      </Frame>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
