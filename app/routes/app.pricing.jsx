import { redirect } from "@remix-run/node";

// Redirect all pricing requests to settings page
// The settings page now has the full billing/pricing UI
export const loader = async () => {
  return redirect("/app/settings");
};

export const action = async () => {
  return redirect("/app/settings");
};

export default function Pricing() {
  // This should never render due to redirect in loader
  return null;
}
