import { getClaudeClient, CLAUDE_MODEL } from "../utils/claude.server";

// CORS headers for widget access
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const { answers, products, quizTitle } = body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return new Response("answers array is required", { status: 400, headers: corsHeaders });
  }

  const openai = getClaudeClient();

  const answersText = answers
    .map((a) => `- ${a.question}: ${a.answer}`)
    .join("\n");

  const productsText =
    products && products.length > 0
      ? `\n\nRecommended products:\n${products.map((p) => `- ${p.title}${p.price ? ` ($${p.price})` : ""}`).join("\n")}`
      : "";

  const prompt = `You are a personalized shopping assistant. A customer just completed a product quiz${quizTitle ? ` called "${quizTitle}"` : ""}.

Their answers:
${answersText}${productsText}

Write a warm, personalized 2-3 sentence result message that:
1. Acknowledges their specific answers
2. Explains why these products are perfect for them
3. Encourages them to explore the recommendations

Be conversational, enthusiastic, and specific to their answers. Do not use generic phrases. Do not include any formatting or markdown.`;

  try {
    const stream = await openai.chat.completions.create({
      model: CLAUDE_MODEL,
      max_completion_tokens: 300,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("[Result Copy] Stream error:", err);
          controller.enqueue(encoder.encode("data: [ERROR]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[Result Copy] Error:", err);
    return new Response("Failed to generate result copy", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
