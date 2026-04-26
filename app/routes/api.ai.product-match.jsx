import { json } from "@remix-run/node";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { getClaudeClient, CLAUDE_MODEL } from "../utils/claude.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PRODUCTS_QUERY = `#graphql
  query getProducts($first: Int!) {
    products(first: $first, query: "status:active") {
      edges {
        node {
          id
          title
          description
          productType
          tags
          handle
          images(first: 1) {
            edges {
              node {
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
    }
  }
`;

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
  }

  const { answers, quizId, shop, maxProducts = 4 } = body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return json({ error: "answers array is required" }, { status: 400, headers: corsHeaders });
  }

  if (!shop && !quizId) {
    return json({ error: "shop or quizId is required" }, { status: 400, headers: corsHeaders });
  }

  // Resolve shop from quizId if not provided
  let targetShop = shop;
  if (quizId) {
    try {
      const parsedQuizId = parseInt(quizId, 10);
      const quiz = await prisma.quiz.findFirst({
        where: { quiz_id: parsedQuizId, deleted_at: null },
        select: { shop: true },
      });
      if (quiz) targetShop = quiz.shop;
    } catch {
      // use provided shop
    }
  }

  if (!targetShop) {
    return json({ error: "Could not resolve shop" }, { status: 400, headers: corsHeaders });
  }

  // Fetch products via unauthenticated admin API
  let products = [];
  try {
    const { admin } = await unauthenticated.admin(targetShop);
    const response = await admin.graphql(PRODUCTS_QUERY, { variables: { first: 50 } });
    const data = await response.json();
    products = (data.data?.products?.edges || []).map((e) => ({
      id: e.node.id,
      title: e.node.title,
      description: (e.node.description || "").substring(0, 300),
      type: e.node.productType || "",
      tags: (e.node.tags || []).slice(0, 8),
      handle: e.node.handle,
      image: e.node.images?.edges?.[0]?.node?.url || null,
      price: e.node.variants?.edges?.[0]?.node?.price || "0",
    }));
  } catch (err) {
    console.error("[Product Match] Failed to fetch products:", err);
    return json({ error: "Failed to fetch product catalog" }, { status: 500, headers: corsHeaders });
  }

  if (products.length === 0) {
    return json({ products: [] }, { headers: corsHeaders });
  }

  const openai = getClaudeClient();

  const answersText = answers.map((a) => `- ${a.question}: ${a.answer}`).join("\n");
  const catalogText = products
    .map((p, i) => `[${i}] ${p.title}${p.type ? ` | Type: ${p.type}` : ""}${p.tags.length ? ` | Tags: ${p.tags.join(", ")}` : ""}${p.description ? ` | ${p.description.substring(0, 150)}` : ""}`)
    .join("\n");

  const prompt = `You are a product recommendation engine. Based on a customer's quiz answers, select the ${maxProducts} most relevant products from the catalog.

Customer quiz answers:
${answersText}

Product catalog:
${catalogText}

Return ONLY a JSON array of the indices (numbers) of the best matching products, ordered by relevance.
Example: [3, 0, 7, 2]

Select exactly ${maxProducts} products or fewer if there aren't enough good matches. Return only the JSON array, nothing else.`;

  try {
    const message = await openai.chat.completions.create({
      model: CLAUDE_MODEL,
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: "You are a product recommendation engine. Return only valid JSON arrays of product indices.",
        },
        { role: "user", content: prompt },
      ],
    });

    let jsonStr = message.choices[0].message.content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const indices = JSON.parse(jsonStr);
    if (!Array.isArray(indices)) throw new Error("Invalid response format");

    const matched = indices
      .filter((i) => typeof i === "number" && i >= 0 && i < products.length)
      .slice(0, maxProducts)
      .map((i) => products[i]);

    return json({ products: matched }, { headers: corsHeaders });
  } catch (err) {
    console.error("[Product Match] Model error:", err);
    // Fallback: return first N products
    return json({ products: products.slice(0, maxProducts), fallback: true }, { headers: corsHeaders });
  }
}
