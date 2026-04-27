import { getClaudeClient } from "../utils/claude.server";

// Use vision-capable model for wizard — analyzes product images + text
const WIZARD_MODEL = "gpt-4o";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { pool = [], poolType = "products", questionCount } = body;

  if (!pool || pool.length === 0) {
    return new Response(JSON.stringify({ error: "Pool is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Heartbeat every 8s — prevents Heroku H12 30s timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('data: {"type":"ping"}\n\n'));
        } catch {}
      }, 8000);

      try {
        const openai = getClaudeClient();
        const itemLabel = poolType === "collections" ? "collections" : "products";

        // Auto-calculate question count based on pool size
        const numQuestions = questionCount || Math.min(5, Math.max(3, Math.ceil(pool.length / 3)));

        const systemPrompt = `You are an expert e-commerce quiz designer. Your job is to analyze a merchant's ${itemLabel} and create the ideal product recommendation quiz.

You will receive ${itemLabel} with titles, descriptions, tags, prices, and images. Study them carefully to understand:
- What categories/types exist
- What differentiates them (use case, customer profile, price point, style, ingredients, etc.)
- What customer preferences map to each ${itemLabel.slice(0, -1)}

Return ONLY valid JSON with this exact structure:
{
  "analysis": "2-3 sentence plain-English overview of the catalog. What you found, what the key differentiators are.",
  "questions": [
    {
      "question_text": "A clear, friendly customer-facing question",
      "metafield_key": "snake_case_key",
      "reasoning": "1-2 sentences: which specific ${itemLabel} this question differentiates and why it matters for recommendations",
      "answers": [
        {
          "answer_text": "Short, clear answer option",
          "action_type": "show_text",
          "action_data": "Short encouraging message shown to customer when they pick this"
        }
      ]
    }
  ]
}

Rules:
- Generate exactly ${numQuestions} questions
- Each question must have 3-4 answers
- Questions must cover DIFFERENT dimensions — no overlap
- metafield_key: lowercase letters and underscores only
- Each question should meaningfully narrow down which ${itemLabel} to recommend
- Answers should feel natural and customer-friendly, not technical
- No markdown, no explanation outside the JSON`;

        // Build vision-capable message content
        // Include images for up to 8 items (detail:low = ~85 tokens each)
        const userContentParts = [
          {
            type: "text",
            text: `Analyze these ${pool.length} ${itemLabel} and create a product recommendation quiz:\n`,
          },
        ];

        pool.forEach((item, i) => {
          const parts = [];
          parts.push(`\n[${i + 1}] ${item.title}`);
          if (item.price && item.price !== "0") parts.push(`Price: $${item.price}`);
          if (item.description) parts.push(`Description: ${item.description.substring(0, 250)}`);
          if (item.tags?.length) parts.push(`Tags: ${item.tags.join(", ")}`);

          userContentParts.push({ type: "text", text: parts.join(" | ") });

          // Include image if available (limit to first 8 to control token cost)
          if (item.image && i < 8) {
            userContentParts.push({
              type: "image_url",
              image_url: { url: item.image, detail: "low" },
            });
          }
        });

        userContentParts.push({
          type: "text",
          text: `\nNow generate the quiz JSON (${numQuestions} questions) that best differentiates between these ${itemLabel}.`,
        });

        const message = await openai.chat.completions.create({
          model: WIZARD_MODEL,
          max_tokens: 3000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContentParts },
          ],
        });

        clearInterval(heartbeat);

        const choice = message.choices[0];
        let rawContent = choice.message.content?.trim() || "";

        console.log("[Quiz Wizard] finish_reason:", choice.finish_reason);
        console.log("[Quiz Wizard] raw (first 400):", rawContent.substring(0, 400));

        // Strip markdown fences
        const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = fenceMatch ? fenceMatch[1].trim() : rawContent;

        const result = JSON.parse(jsonStr);

        if (!result.questions || !Array.isArray(result.questions)) {
          throw new Error("Invalid quiz structure from model");
        }

        // Send analysis first so UI can show it while we send the rest
        if (result.analysis) {
          send({ type: "analysis", text: result.analysis });
        }

        send({ type: "result", quiz: result });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        clearInterval(heartbeat);
        console.error("[Quiz Wizard] Error:", err.message);
        send({ type: "error", error: "Failed to analyze products. Please try again." });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }

      controller.close();
    },
  });

  return new Response(sseStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
