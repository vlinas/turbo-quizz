import { getClaudeClient } from "../utils/claude.server";

// Vision-capable model for wizard — analyzes product images + text
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

  const { pool = [], poolType = "products", userInstructions = "", extraInstructions = "" } = body;

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
        const numQuestions = Math.min(5, Math.max(3, Math.ceil(pool.length / 3)));

        const systemPrompt = `You are an expert e-commerce quiz designer. Analyze the merchant's ${itemLabel} and create a product recommendation quiz where each answer directly maps to specific ${itemLabel}.

Study the ${itemLabel} carefully — their images, descriptions, tags, prices — to understand:
- What categories/use-cases/customer profiles exist
- What differentiates them
- Which ${itemLabel} belong together vs. apart

Return ONLY valid JSON with this exact structure:
{
  "analysis": "2-3 sentence plain English overview: what you found, key differentiators, customer segments.",
  "questions": [
    {
      "question_text": "Clear, friendly customer-facing question",
      "metafield_key": "snake_case_key",
      "reasoning": "1-2 sentences: which ${itemLabel} this question separates and why",
      "answers": [
        {
          "answer_text": "Short answer option",
          "product_indices": [0, 2]
        }
      ]
    }
  ]
}

CRITICAL RULES for product_indices:
- product_indices contains indices (0-based) into the ${itemLabel} pool
- Each answer MUST have 1-3 product_indices
- Different answers should map to DIFFERENT ${itemLabel} (some overlap is OK)
- ALL pool ${itemLabel} must appear in at least one answer across the quiz
- Indices must be valid: 0 to ${pool.length - 1}
- Choose indices that genuinely match the answer choice

Other rules:
- Generate exactly ${numQuestions} questions
- Each question must have 3-4 answers
- Questions cover DIFFERENT dimensions — no overlap
- metafield_key: lowercase letters and underscores only
- No markdown, no explanation outside the JSON`;

        // Build vision-capable message with images
        const userContentParts = [
          {
            type: "text",
            text: `Analyze these ${pool.length} ${itemLabel} (indices 0-${pool.length - 1}) and create a product recommendation quiz:\n`,
          },
        ];

        pool.forEach((item, i) => {
          if (poolType === "collections" && Array.isArray(item.products) && item.products.length > 0) {
            // Enriched collection — summarise its products for AI
            const productSummary = item.products
              .slice(0, 12)
              .map((p) => {
                let s = p.title;
                if (p.price && p.price !== "0") s += ` ($${parseFloat(p.price).toFixed(0)})`;
                return s;
              })
              .join(", ");
            const allTags = [...new Set(item.products.flatMap((p) => p.tags || []))].slice(0, 10);
            const parts = [
              `[${i}] ${item.title}`,
              `${item.products.length} products: ${productSummary}`,
            ];
            if (allTags.length) parts.push(`Common tags: ${allTags.join(", ")}`);
            userContentParts.push({ type: "text", text: parts.join(" | ") });
            if (item.image && i < 8) {
              userContentParts.push({ type: "image_url", image_url: { url: item.image, detail: "low" } });
            }
          } else {
            // Product (or unenriched collection)
            const parts = [`[${i}] ${item.title}`];
            if (item.price && item.price !== "0") parts.push(`$${item.price}`);
            if (item.description) parts.push(item.description.substring(0, 200));
            if (item.tags?.length) parts.push(`Tags: ${item.tags.join(", ")}`);
            userContentParts.push({ type: "text", text: parts.join(" | ") });
            if (item.image && i < 8) {
              userContentParts.push({ type: "image_url", image_url: { url: item.image, detail: "low" } });
            }
          }
        });

        const instructionParts = [];
        if (userInstructions) instructionParts.push(`Merchant instructions: ${userInstructions}`);
        if (extraInstructions) instructionParts.push(`Additional changes requested: ${extraInstructions}`);

        userContentParts.push({
          type: "text",
          text: `\nGenerate ${numQuestions} questions. Assign product_indices to each answer. Indices are 0 to ${pool.length - 1}.${instructionParts.length ? `\n\n${instructionParts.join("\n")}` : ""} Return ONLY the JSON.`,
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
        console.log("[Quiz Wizard] raw (first 500):", rawContent.substring(0, 500));

        // Strip markdown fences
        const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = fenceMatch ? fenceMatch[1].trim() : rawContent;

        const result = JSON.parse(jsonStr);

        if (!result.questions || !Array.isArray(result.questions)) {
          throw new Error("Invalid quiz structure from model");
        }

        // Map product_indices → actual product objects in action_data
        const processedQuestions = result.questions.map((q) => ({
          question_text: q.question_text,
          metafield_key: q.metafield_key,
          reasoning: q.reasoning,
          answers: q.answers.map((a) => {
            const assignedProducts = (a.product_indices || [])
              .filter((i) => typeof i === "number" && i >= 0 && i < pool.length)
              .map((i) => pool[i]);

            return {
              answer_text: a.answer_text,
              action_type: "show_products",
              action_data: {
                products: assignedProducts,
                ai_generated: true,
                pool_type: poolType, // used by widget to pick correct link/label
              },
            };
          }),
        }));

        if (result.analysis) {
          send({ type: "analysis", text: result.analysis });
        }

        send({ type: "result", quiz: { ...result, questions: processedQuestions } });
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
