import { authenticate } from "../shopify.server";
import db from "../db.server";
import { notifyAppUninstalled, notifyPlanChange } from "../utils/discord.server";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
  );

  // Handle APP_UNINSTALLED first - admin is null after uninstall
  if (topic === "APP_UNINSTALLED") {
    // Send Discord notification
    await notifyAppUninstalled(shop);

    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    return new Response(null, { status: 200 });
  }

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    throw new Response();
  }

  switch (topic) {
    case "ORDERS_PAID":
      // QUIZ ATTRIBUTION: Attribute paid order to quiz session
      try {
        const customerEmail = payload.customer?.email || payload.email;
        const customerId = payload.customer?.id ? String(payload.customer.id) : null;

        // Find the most recent completed quiz session for this customer
        // Attribution priority (from most reliable to least):
        // 1. Cart attributes (direct session_id)
        // 2. Customer ID match
        // 3. Email match (for cross-device)
        // 4. Order notes (legacy)
        let quizSession = null;
        let attributionMethod = null;

        // Method 1: Check cart attributes for session_id (most reliable)
        if (!quizSession && payload.note_attributes) {
          const sessionIdAttr = payload.note_attributes.find(
            attr => attr.name === 'quizza_session'
          );

          if (sessionIdAttr && sessionIdAttr.value) {
            const sessionId = sessionIdAttr.value;

            quizSession = await db.quizSession.findUnique({
              where: {
                session_id: sessionId,
              },
            });

            if (quizSession) {
              attributionMethod = 'cart_attributes';
            }
          }
        }

        // Method 2: Try to find session by customer_id
        if (!quizSession && customerId) {
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

          if (quizSession) {
            attributionMethod = 'customer_id';
          }
        }

        // Method 3: Try email-based attribution (for cross-device purchases)
        // Look for recent completed sessions by looking at order attributions with same email
        if (!quizSession && customerEmail) {
          // Find any previous orders from this email that have quiz attribution
          const previousAttribution = await db.quizOrderAttribution.findFirst({
            where: {
              shop,
              customer_email: customerEmail,
            },
            orderBy: {
              order_created_at: 'desc',
            },
            include: {
              session: {
                where: {
                  is_completed: true,
                },
              },
            },
          });

          if (previousAttribution && previousAttribution.session) {
            // Use the same session from their previous purchase
            quizSession = previousAttribution.session;
            attributionMethod = 'email_match';
          }
        }

        // Method 4: Check order notes for session_id (legacy support)
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

            if (quizSession) {
              attributionMethod = 'order_notes';
            }
          }
        }

        // Log attribution result
        if (quizSession) {
          console.log(`[Quiz Attribution] Order ${payload.id} attributed via ${attributionMethod}`);
        } else {
          console.log(`[Quiz Attribution] No session found for order ${payload.id}`);
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
            const orderDate = new Date(payload.created_at);
            // Set to start of day for consistent daily aggregations
            orderDate.setUTCHours(0, 0, 0, 0);

            // Create the order attribution
            const orderAttribution = await db.quizOrderAttribution.create({
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

            // Create answer-level attributions for data warehouse queries
            // Get all answer selections for this session with their question/answer details
            const answerSelections = await db.answerSelection.findMany({
              where: {
                session_id: quizSession.session_id,
              },
              include: {
                answer: {
                  include: {
                    question: true,
                  },
                },
              },
            });

            // Create attribution records for each answer selected in this session
            if (answerSelections.length > 0) {
              await db.answerOrderAttribution.createMany({
                data: answerSelections.map((selection) => ({
                  order_attribution_id: orderAttribution.id,
                  answer_id: selection.answer_id,
                  question_id: selection.question_id,
                  quiz_id: quizSession.quiz_id,
                  shop,
                  // Denormalized fields for efficient querying
                  answer_text: selection.answer.answer_text,
                  question_text: selection.answer.question.question_text,
                  order_id: String(payload.id),
                  order_total: totalPrice,
                  currency: payload.currency || "USD",
                  order_date: orderDate,
                  selected_at: selection.selected_at,
                })),
              });

              console.log(`[Quiz Attribution] Created ${answerSelections.length} answer-level attributions for order ${payload.id}`);
            }
          }
        }

        // Add quiz answers as customer tags (if customer exists)
        if (payload.customer?.id && payload.note_attributes) {
          try {
            const quizAnswers = payload.note_attributes.filter(
              attr => attr.name.startsWith('quiz_') && attr.name !== 'quiz_id' && attr.name !== 'quiz_session' && attr.name !== 'quizza_session'
            );

            if (quizAnswers.length > 0) {
              const customerGid = `gid://shopify/Customer/${payload.customer.id}`;

              // Build tags from quiz answers (format: "quiz:key:value")
              const newTags = quizAnswers.map(attr => {
                // Remove 'quiz_' prefix to get the key
                const key = attr.name.replace('quiz_', '');
                // Sanitize value for tag (lowercase, replace spaces with hyphens)
                const value = String(attr.value).toLowerCase().replace(/\s+/g, '-').substring(0, 40);
                return `quiz:${key}:${value}`;
              });

              // Use customerUpdate mutation to add tags
              const mutation = `
                mutation CustomerAddTags($id: ID!, $tags: [String!]!) {
                  tagsAdd(id: $id, tags: $tags) {
                    node {
                      id
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `;

              const response = await admin.graphql(mutation, {
                variables: {
                  id: customerGid,
                  tags: newTags,
                },
              });

              const result = await response.json();

              if (result.data?.tagsAdd?.userErrors?.length > 0) {
                console.error('[Quiz Tags] Errors:', result.data.tagsAdd.userErrors);
              } else {
                console.log(`[Quiz Tags] Added ${newTags.length} tags to customer ${payload.customer.id}: ${newTags.join(', ')}`);
              }
            }
          } catch (tagError) {
            console.error('[Quiz Tags] Error adding customer tags:', tagError);
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
        // Delete shop plan
        await db.shopPlan.deleteMany({ where: { shop } });
        // Delete sessions
        await db.session.deleteMany({ where: { shop } });
        console.log(`[GDPR] Deleted all data for shop ${shop}`);
      } catch (error) {
        console.error("[GDPR] Error deleting shop data:", error);
      }
      break;

    case "APP_SUBSCRIPTIONS_UPDATE":
      // Handle subscription changes (upgrade/downgrade/cancel)
      try {
        const subscriptionName = payload.app_subscription?.name;
        const subscriptionStatus = payload.app_subscription?.status;
        let newPlan = "free";

        // Handle both lowercase handles (from App Store) and capitalized names
        const nameLower = subscriptionName?.toLowerCase();
        if (nameLower === "starter") {
          newPlan = "starter";
        } else if (nameLower === "growth") {
          newPlan = "growth";
        }

        await db.shopPlan.upsert({
          where: { shop },
          update: { plan: newPlan },
          create: { shop, plan: newPlan },
        });

        console.log(`[Billing] Updated plan for ${shop} to ${newPlan}`);

        // Send Discord notification for plan change
        await notifyPlanChange(shop, subscriptionName || newPlan, subscriptionStatus || "UNKNOWN");
      } catch (error) {
        console.error("[Billing] Error updating subscription:", error);
      }
      break;

    default:
      console.log(`[Webhook] Unhandled webhook topic: ${topic}`);
      break;
  }

  // Return 200 OK for successful webhook processing
  // This is required for Shopify Partner Dashboard automated checks
  return new Response(null, { status: 200 });
};
