import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getClaudeClient, CLAUDE_MODEL } from "../utils/claude.server";

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

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  const body = await request.json();
  const { storeDescription, quizGoal, questionCount = 3 } = body;

  if (!storeDescription) {
    return json({ error: "Store description is required" }, { status: 400 });
  }

  // Fetch product catalog from Shopify (up to 50 products)
  let products = [];
  try {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: 50 },
    });
    const data = await response.json();
    products = (data.data?.products?.edges || []).map((e) => ({
      id: e.node.id,
      title: e.node.title,
      description: e.node.description?.substring(0, 200) || "",
      type: e.node.productType,
      tags: e.node.tags?.slice(0, 5) || [],
      price: e.node.variants?.edges?.[0]?.node?.price || "0",
    }));
  } catch (err) {
    console.error("[AI Quiz Generator] Failed to fetch products:", err);
  }

  const openai = getClaudeClient();

  const systemPrompt = `You are an expert e-commerce quiz designer. Generate product recommendation quizzes that help customers find the right products.

Return ONLY valid JSON matching this exact schema:
{
  "quiz_title": "string",
  "quiz_description": "string",
  "questions": [
    {
      "question_text": "string",
      "metafield_key": "string (snake_case, for customer tagging, e.g. skin_type)",
      "answers": [
        {
          "answer_text": "string",
          "action_type": "show_text",
          "action_data": "string (helpful recommendation message for this answer)"
        }
      ]
    }
  ]
}

Rules:
- Generate exactly ${questionCount} questions
- Each question must have 2-4 answers
- Questions should progressively narrow down product recommendations
- metafield_key must be lowercase with underscores only
- action_data should be an encouraging, helpful message that previews the type of products they'll see
- Make questions conversational and customer-friendly`;

  const userPrompt = `Store description: ${storeDescription}
${quizGoal ? `Quiz goal: ${quizGoal}` : ""}

Product catalog (${products.length} products):
${products.map((p) => `- ${p.title}${p.type ? ` (${p.type})` : ""}${p.tags.length ? ` [${p.tags.join(", ")}]` : ""}`).join("\n")}

Generate a product recommendation quiz for this store.`;

  try {
    const message = await openai.chat.completions.create({
      model: CLAUDE_MODEL,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let jsonStr = message.choices[0].message.content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const quiz = JSON.parse(jsonStr);

    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      throw new Error("Invalid quiz structure from model");
    }

    return json({ success: true, quiz });
  } catch (err) {
    console.error("[AI Quiz Generator] Error:", err);
    return json(
      { error: "Failed to generate quiz. Please try again." },
      { status: 500 }
    );
  }
};
