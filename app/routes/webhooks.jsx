import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
  );

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await db.session.deleteMany({ where: { shop } });
      }

      break;
    case "ORDERS_PAID":
      // QUIZ ATTRIBUTION: Attribute paid order to quiz session
      try {
        const customerEmail = payload.customer?.email || payload.email;
        const customerId = payload.customer?.id ? String(payload.customer.id) : null;

        // Find the most recent completed quiz session for this customer
        let quizSession = null;

        // Try to find session by customer_id first
        if (customerId) {
          quizSession = await db.quizSession.findFirst({
            where: {
              shop,
              customer_id: customerId,
              is_completed: true,
            },
            orderBy: {
              completed_at: 'desc',
            },
          });
        }

        // If no session found, check cart attributes for session_id
        if (!quizSession && payload.note_attributes) {
          const sessionIdAttr = payload.note_attributes.find(
            attr => attr.name === 'turbo_quiz_session'
          );

          if (sessionIdAttr && sessionIdAttr.value) {
            const sessionId = sessionIdAttr.value;

            quizSession = await db.quizSession.findUnique({
              where: {
                session_id: sessionId,
              },
            });
          }
        }

        // If still no session found, check order notes for session_id (legacy support)
        if (!quizSession) {
          const orderNote = payload.note || "";
          const sessionIdMatch = orderNote.match(/quiz_session:([a-zA-Z0-9-]+)/);

          if (sessionIdMatch) {
            const sessionId = sessionIdMatch[1];

            quizSession = await db.quizSession.findUnique({
              where: {
                session_id: sessionId,
              },
            });
          }
        }

        // If we found a quiz session, attribute this order to it
        if (quizSession) {
          // Check if this order was already attributed
          const existingAttribution = await db.quizOrderAttribution.findUnique({
            where: {
              order_id_shop: {
                order_id: String(payload.id),
                shop,
              },
            },
          });

          if (!existingAttribution) {
            const totalPrice = parseFloat(payload.total_price || payload.current_total_price || 0);

            await db.quizOrderAttribution.create({
              data: {
                order_id: String(payload.id),
                order_number: String(payload.order_number || payload.name || payload.id),
                session_id: quizSession.session_id,
                quiz_id: quizSession.quiz_id,
                shop,
                customer_id: customerId,
                customer_email: customerEmail,
                total_price: totalPrice,
                currency: payload.currency || "USD",
                line_items_count: payload.line_items?.length || 0,
                order_created_at: new Date(payload.created_at),
              },
            });
          }
        }
      } catch (error) {
        console.error("[Quiz Attribution] Error:", error);
      }

      break;

    case "CUSTOMERS_DATA_REQUEST":
      // Handle customer data request (GDPR compliance)
      // In a production app, you would:
      // 1. Collect all customer data from your database
      // 2. Return it in the required format
      // For now, we'll just acknowledge receipt
      console.log(`[GDPR] Customer data request for shop: ${shop}`);
      break;

    case "CUSTOMERS_REDACT":
      // Handle customer data deletion (GDPR compliance)
      // Delete or anonymize customer data
      try {
        const customerId = payload.customer?.id ? String(payload.customer.id) : null;
        if (customerId) {
          // Delete quiz sessions for this customer
          await db.quizSession.deleteMany({
            where: {
              shop,
              customer_id: customerId,
            },
          });
          console.log(`[GDPR] Deleted customer data for customer ${customerId} in shop ${shop}`);
        }
      } catch (error) {
        console.error("[GDPR] Error deleting customer data:", error);
      }
      break;

    case "SHOP_REDACT":
      // Handle shop data deletion (store uninstalled for 48+ hours)
      // Delete all shop data
      try {
        // Delete all quiz sessions for this shop
        await db.quizSession.deleteMany({ where: { shop } });
        // Delete all quizzes for this shop
        await db.quiz.deleteMany({ where: { shop } });
        // Delete shop settings
        await db.shopSettings.deleteMany({ where: { shop } });
        // Delete sessions
        await db.session.deleteMany({ where: { shop } });
        console.log(`[GDPR] Deleted all data for shop ${shop}`);
      } catch (error) {
        console.error("[GDPR] Error deleting shop data:", error);
      }
      break;

    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
