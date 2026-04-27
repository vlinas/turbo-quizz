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

  const { storeDescription, quizGoal, questionCount = 3, pool = [], poolType = "products" } = body;

  if (!storeDescription) {
    return new Response(JSON.stringify({ error: "Store description is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const sseStream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Heartbeat every 8s — prevents Heroku H12 30s timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("data: {\"type\":\"ping\"}\n\n"));
        } catch {}
      }, 8000);

      try {
        const openai = getClaudeClient();
        const hasPool = Array.isArray(pool) && pool.length > 0;
        const itemLabel = poolType === "collections" ? "collections" : "products";

        const systemPrompt = `You are an e-commerce quiz designer. Generate a product recommendation quiz as compact JSON.
${hasPool
  ? `IMPORTANT: Quiz has a curated ${itemLabel} pool. Questions must help DISTINGUISH which ${itemLabel} fits each customer. Each question reveals a preference that differentiates between pool ${itemLabel}.`
  : "Generate questions that help customers discover the right products for their needs."
}

Return ONLY valid JSON:
{"quiz_title":"string","questions":[{"question_text":"string","metafield_key":"snake_case_string","answers":[{"answer_text":"string","action_type":"show_text","action_data":"short encouraging message"}]}]}

Rules: exactly ${questionCount} questions, 2-4 answers each, metafield_key lowercase underscores only, no markdown, no explanation.`;

        const poolContext = hasPool
          ? `\n\n${itemLabel} pool (${pool.length} items):\n${pool.map((p) => {
              const parts = [`- ${p.title}`];
              if (p.description) parts.push(p.description.substring(0, 120));
              if (p.tags?.length) parts.push(`[${p.tags.slice(0, 4).join(", ")}]`);
              return parts.join(" | ");
            }).join("\n")}`
          : "";

        const userPrompt = `Store: ${storeDescription}${quizGoal ? `\nGoal: ${quizGoal}` : ""}${poolContext}\n\nGenerate the quiz JSON now.`;

        const message = await openai.chat.completions.create({
          model: CLAUDE_MODEL,
          max_completion_tokens: 1500,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        clearInterval(heartbeat);

        let jsonStr = message.choices[0].message.content.trim();
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();

        const quiz = JSON.parse(jsonStr);
        if (!quiz.questions || !Array.isArray(quiz.questions)) {
          throw new Error("Invalid quiz structure");
        }

        send({ type: "result", quiz });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        clearInterval(heartbeat);
        console.error("[AI Quiz Generator] Error:", err);
        send({ type: "error", error: "Failed to generate quiz. Please try again." });
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
