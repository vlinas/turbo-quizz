import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { authenticate } from "../shopify.server";
import { Frame } from "@shopify/polaris";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles }
];

export const loader = async ({ request }) => {
  try {
    // Authenticate but don't force billing
    // Users start on free tier (1 quiz) and upgrade via /app/pricing
    await authenticate.admin(request);

    return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
  } catch (error) {
    // If it's a Response object (redirect), re-throw it so Remix handles it
    if (error instanceof Response) {
      throw error;
    }
    console.error("[App Loader Error]", error);
    throw error;
  }
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
          <Link to="/app/analytics">Analytics</Link>
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
