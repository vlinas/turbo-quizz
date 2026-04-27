import { json } from "@remix-run/node";
import { getClaudeClient, CLAUDE_MODEL } from "../utils/claude.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

  // pool: array of {id, title, description, tags, handle, image, price} passed directly from widget
  // poolType: "products" | "collections"
  const { answers, pool, poolType, maxResults = 4 } = body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return json({ error: "answers array is required" }, { status: 400, headers: corsHeaders });
  }

  if (!pool || !Array.isArray(pool) || pool.length === 0) {
    return json({ error: "pool array is required" }, { status: 400, headers: corsHeaders });
  }

  const openai = getClaudeClient();

  const answersText = answers.map((a) => `- ${a.question}: ${a.answer}`).join("\n");

  const catalogText = pool
    .map((item, i) => {
      const parts = [`[${i}] ${item.title}`];
      if (item.description) parts.push(item.description.substring(0, 200));
      if (item.tags?.length) parts.push(`Tags: ${item.tags.join(", ")}`);
      if (item.price) parts.push(`Price: $${item.price}`);
      return parts.join(" | ");
    })
    .join("\n");

  const itemLabel = poolType === "collections" ? "collections" : "products";

  const prompt = `You are a product recommendation engine. A customer completed a quiz. Based on ALL their answers, select the ${maxResults} best matching ${itemLabel}.

Customer answers:
${answersText}

Available ${itemLabel}:
${catalogText}

Return ONLY a JSON array of indices (numbers) of the best matches, ordered by relevance.
Example: [2, 0, 5, 3]

Select up to ${maxResults} ${itemLabel}. Return only the JSON array, nothing else.`;

  try {
    const message = await openai.chat.completions.create({
      model: CLAUDE_MODEL,
      max_completion_tokens: 100,
      messages: [
        {
          role: "system",
          content: `You are a ${itemLabel} recommendation engine. Return only valid JSON arrays of indices.`,
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
      .filter((i) => typeof i === "number" && i >= 0 && i < pool.length)
      .slice(0, maxResults)
      .map((i) => pool[i]);

    return json({ items: matched, poolType }, { headers: corsHeaders });
  } catch (err) {
    console.error("[Product Match] Model error:", err);
    // Fallback: return first N items
    return json({ items: pool.slice(0, maxResults), poolType, fallback: true }, { headers: corsHeaders });
  }
}
