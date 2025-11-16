import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * API endpoint to sync recent orders and attribute them to quiz sessions
 * This runs periodically to check for new orders with quiz session cart attributes
 */
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Fetch orders from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Use GraphQL to fetch orders with note_attributes
    const response = await admin.graphql(
      `#graphql
      query getRecentOrders($createdAtMin: DateTime!) {
        orders(first: 50, query: $createdAtMin, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              lineItems(first: 250) {
                edges {
                  node {
                    id
                  }
                }
              }
              customAttributes {
                key
                value
              }
              customer {
                id
                email
              }
            }
          }
        }
      }`,
      {
        variables: {
          createdAtMin: sevenDaysAgo.toISOString(),
        },
      }
    );

    const data = await response.json();
    const orders = data.data?.orders?.edges || [];

    let attributedCount = 0;
    let skippedCount = 0;

    for (const { node: order } of orders) {
      // Extract numeric order ID from GraphQL ID (gid://shopify/Order/123456)
      const orderIdMatch = order.id.match(/\/Order\/(\d+)/);
      if (!orderIdMatch) continue;

      const orderId = orderIdMatch[1];

      // Check if already attributed
      const existing = await db.quizOrderAttribution.findUnique({
        where: {
          order_id_shop: {
            order_id: orderId,
            shop: session.shop,
          },
        },
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      // Look for quiz session ID in custom attributes
      const sessionAttr = order.customAttributes?.find(
        (attr) => attr.key === 'turbo_quiz_session'
      );

      if (!sessionAttr || !sessionAttr.value) {
        continue;
      }

      const sessionId = sessionAttr.value;

      // Find the quiz session
      const quizSession = await db.quizSession.findUnique({
        where: {
          session_id: sessionId,
        },
      });

      if (!quizSession) {
        continue;
      }

      // Create attribution
      const totalPrice = parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);
      const currency = order.totalPriceSet?.shopMoney?.currencyCode || "USD";
      const lineItemsCount = order.lineItems?.edges?.length || 0;

      // Extract customer data
      const customerId = order.customer?.id ?
        order.customer.id.match(/\/Customer\/(\d+)/)?.[1] : null;
      const customerEmail = order.customer?.email || null;

      await db.quizOrderAttribution.create({
        data: {
          order_id: orderId,
          order_number: order.name,
          session_id: sessionId,
          quiz_id: quizSession.quiz_id,
          shop: session.shop,
          customer_id: customerId,
          customer_email: customerEmail,
          total_price: totalPrice,
          currency: currency,
          line_items_count: lineItemsCount,
          order_created_at: new Date(order.createdAt),
        },
      });

      attributedCount++;
    }

    return json({
      success: true,
      ordersChecked: orders.length,
      attributed: attributedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error("[Order Sync] Error:", error);
    return json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
};
