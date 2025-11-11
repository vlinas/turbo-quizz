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
    case "ORDERS_CREATE":
      // QUIZ ATTRIBUTION: Attribute order to quiz session
      try {
        console.log(`[Quiz Attribution] Processing order #${payload.order_number || payload.id}`);

        const customerEmail = payload.customer?.email || payload.email;
        const customerId = payload.customer?.id ? String(payload.customer.id) : null;

        console.log(`[Quiz Attribution] Customer email: ${customerEmail}, ID: ${customerId}`);

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
            console.log(`[Quiz Attribution] Found session ID in cart attributes: ${sessionId}`);

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
            console.log(`[Quiz Attribution] Found session ID in order note: ${sessionId}`);

            quizSession = await db.quizSession.findUnique({
              where: {
                session_id: sessionId,
              },
            });
          }
        }

        // If we found a quiz session, attribute this order to it
        if (quizSession) {
          console.log(`[Quiz Attribution] Attributing order to session ${quizSession.session_id}`);

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

            console.log(`[Quiz Attribution] Successfully attributed order #${payload.order_number} ($${totalPrice}) to quiz session ${quizSession.session_id}`);
          } else {
            console.log(`[Quiz Attribution] Order already attributed`);
          }
        } else {
          console.log(`[Quiz Attribution] No quiz session found for this order`);
        }
      } catch (error) {
        console.error("[Quiz Attribution] Error:", error);
      }

      break;
    // console.log(order_id, total_price, currency);

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
