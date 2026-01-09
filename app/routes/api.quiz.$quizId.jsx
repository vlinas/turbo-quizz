import { json } from "@remix-run/node";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

/**
 * Storefront API to fetch quiz data
 * GET /api/quiz/:quizId - Get quiz with questions and answers (no authentication)
 *
 * This API enriches stored product/collection data with handles and images
 * for backwards compatibility with data saved before those fields were fetched.
 */

// Helper to fetch product/collection details from Shopify Admin API
async function enrichProductsWithHandles(products, shop, admin) {
  if (!products || products.length === 0) return products;

  // Check if any products are missing handles or images
  const needsEnrichment = products.some(p =>
    !p.handle ||
    (!p.images?.edges?.[0]?.node?.originalSrc && !p.images?.edges?.[0]?.node?.url && !p.images?.[0]?.originalSrc && !p.images?.[0]?.url && !p.image?.originalSrc && !p.image?.url)
  );

  if (!needsEnrichment) return products;

  try {
    const ids = products.map(p => p.id).filter(Boolean);
    if (ids.length === 0) return products;

    const query = `#graphql
      query Nodes($ids: [ID!]!) {
        nodes(ids: $ids) {
          __typename
          ... on Product {
            id
            title
            handle
            images(first: 1) {
              edges {
                node {
                  originalSrc
                  url
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }`;

    const res = await admin.graphql(query, { variables: { ids } });
    const data = await res.json();
    const nodes = data?.data?.nodes?.filter(Boolean) || [];

    // Create a map for quick lookup
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Merge enriched data back into original products
    return products.map(product => {
      const enriched = nodeMap.get(product.id);
      if (!enriched) return product;

      return {
        ...product,
        handle: product.handle || enriched.handle,
        images: product.images?.edges?.[0] ? product.images : enriched.images,
        variants: product.variants?.edges?.[0] ? product.variants : enriched.variants,
      };
    });
  } catch (error) {
    console.error("Error enriching products:", error);
    return products; // Return original data on error
  }
}

async function enrichCollectionsWithHandles(collections, shop, admin) {
  if (!collections || collections.length === 0) return collections;

  // Check if any collections are missing handles or images
  const needsEnrichment = collections.some(c =>
    !c.handle ||
    (!c.image?.originalSrc && !c.image?.url)
  );

  if (!needsEnrichment) return collections;

  try {
    const ids = collections.map(c => c.id).filter(Boolean);
    if (ids.length === 0) return collections;

    const query = `#graphql
      query Nodes($ids: [ID!]!) {
        nodes(ids: $ids) {
          __typename
          ... on Collection {
            id
            title
            handle
            image {
              originalSrc
              url
            }
          }
        }
      }`;

    const res = await admin.graphql(query, { variables: { ids } });
    const data = await res.json();
    const nodes = data?.data?.nodes?.filter(Boolean) || [];

    // Create a map for quick lookup
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Merge enriched data back into original collections
    return collections.map(collection => {
      const enriched = nodeMap.get(collection.id);
      if (!enriched) return collection;

      return {
        ...collection,
        handle: collection.handle || enriched.handle,
        image: collection.image?.originalSrc ? collection.image : enriched.image,
      };
    });
  } catch (error) {
    console.error("Error enriching collections:", error);
    return collections; // Return original data on error
  }
}

export async function loader({ params, request }) {
  const { quizId } = params;

  if (!quizId) {
    return json(
      {
        success: false,
        error: "Quiz ID is required",
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      }
    );
  }

  // Convert quizId to integer
  const parsedQuizId = parseInt(quizId, 10);
  if (isNaN(parsedQuizId)) {
    return json(
      {
        success: false,
        error: "Invalid quiz ID",
      },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      }
    );
  }

  try {
    // Fetch quiz with questions and answers
    // Allow both active and draft status for testing
    const quiz = await prisma.quiz.findFirst({
      where: {
        quiz_id: parsedQuizId,
        deleted_at: null,
      },
      include: {
        questions: {
          include: {
            answers: {
              select: {
                answer_id: true,
                answer_text: true,
                action_type: true,
                action_data: true,
                order: true,
              },
              orderBy: {
                order: "asc",
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!quiz) {
      return json(
        {
          success: false,
          error: "Quiz not found",
        },
        {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          }
        }
      );
    }

    // Fetch shop settings to get custom CSS
    const shopSettings = await prisma.shopSettings.findUnique({
      where: { shop: quiz.shop },
    });

    // Get admin API for enrichment (unauthenticated context for storefront)
    let admin = null;
    try {
      const { admin: shopifyAdmin } = await unauthenticated.admin(quiz.shop);
      admin = shopifyAdmin;
    } catch (e) {
      console.error("Could not get admin API for enrichment:", e);
    }

    // Enrich answers with product/collection handles and images
    const enrichedQuestions = await Promise.all(
      quiz.questions.map(async (question) => {
        const enrichedAnswers = await Promise.all(
          question.answers.map(async (answer) => {
            const actionData = answer.action_data;

            // Enrich products if present
            if (actionData?.products && admin) {
              const enrichedProducts = await enrichProductsWithHandles(
                actionData.products,
                quiz.shop,
                admin
              );
              return {
                ...answer,
                action_data: {
                  ...actionData,
                  products: enrichedProducts,
                },
              };
            }

            // Enrich collections if present
            if (actionData?.collections && admin) {
              const enrichedCollections = await enrichCollectionsWithHandles(
                actionData.collections,
                quiz.shop,
                admin
              );
              return {
                ...answer,
                action_data: {
                  ...actionData,
                  collections: enrichedCollections,
                },
              };
            }

            return answer;
          })
        );

        return {
          question_id: question.question_id,
          question_text: question.question_text,
          metafield_key: question.metafield_key,
          order: question.order,
          answers: enrichedAnswers,
        };
      })
    );

    // Format response for storefront
    const formattedQuiz = {
      quiz_id: quiz.quiz_id,
      title: quiz.title,
      description: quiz.description,
      theme_settings: quiz.theme_settings,
      custom_css: shopSettings?.customCss || null,
      questions: enrichedQuestions,
    };

    return json(
      {
        success: true,
        quiz: formattedQuiz,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      }
    );
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return json(
      {
        success: false,
        error: "Failed to fetch quiz",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      }
    );
  }
}

// Handle OPTIONS requests for CORS preflight
export async function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  });
}
