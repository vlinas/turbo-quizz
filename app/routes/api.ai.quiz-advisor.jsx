import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getClaudeClient, CLAUDE_MODEL } from "../utils/claude.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const body = await request.formData();
  const quizId = body.get("quizId");

  if (!quizId) {
    return json({ error: "quizId is required" }, { status: 400 });
  }

  const parsedQuizId = parseInt(quizId, 10);
  if (isNaN(parsedQuizId)) {
    return json({ error: "Invalid quizId" }, { status: 400 });
  }

  // Fetch quiz with full structure
  const quiz = await prisma.quiz.findFirst({
    where: { quiz_id: parsedQuizId, shop: session.shop, deleted_at: null },
    include: {
      questions: {
        include: {
          answers: { orderBy: { order: "asc" } },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!quiz) {
    return json({ error: "Quiz not found" }, { status: 404 });
  }

  // Fetch session analytics (last 90 days)
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - 90);

  const sessions = await prisma.quizSession.findMany({
    where: {
      quiz_id: parsedQuizId,
      shop: session.shop,
      started_at: { gte: dateThreshold },
    },
    include: { order_attributions: true },
  });

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.is_completed).length;
  const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;
  const totalRevenue = sessions.reduce(
    (sum, s) => sum + s.order_attributions.reduce((r, o) => r + parseFloat(o.total_price), 0),
    0
  );
  const totalOrders = sessions.reduce((sum, s) => sum + s.order_attributions.length, 0);
  const conversionRate = completedSessions > 0 ? (totalOrders / completedSessions) * 100 : 0;

  // Fetch answer selection stats
  const answerStats = await Promise.all(
    quiz.questions.flatMap((q) =>
      q.answers.map(async (a) => {
        const count = await prisma.answerSelection.count({
          where: { answer_id: a.answer_id, quiz_id: parsedQuizId, shop: session.shop },
        });
        return {
          question: q.question_text,
          answer: a.answer_text,
          selections: count,
        };
      })
    )
  );

  // Group by question for distribution
  const questionStats = quiz.questions.map((q) => {
    const qAnswers = answerStats.filter((s) => s.question === q.question_text);
    const total = qAnswers.reduce((sum, a) => sum + a.selections, 0);
    return {
      question: q.question_text,
      answers: qAnswers.map((a) => ({
        answer: a.answer,
        selections: a.selections,
        percentage: total > 0 ? Math.round((a.selections / total) * 100) : 0,
      })),
    };
  });

  const openai = getClaudeClient();

  const quizStructure = quiz.questions
    .map((q, qi) => {
      const stats = questionStats[qi];
      const answerLines = q.answers
        .map((a) => {
          const stat = stats.answers.find((s) => s.answer === a.answer_text);
          return `    - "${a.answer_text}" → ${a.action_type} (${stat?.percentage ?? 0}% selected)`;
        })
        .join("\n");
      return `Q${qi + 1}: "${q.question_text}"\n${answerLines}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a quiz conversion optimization expert for e-commerce. Return only valid JSON.`;

  const userPrompt = `Analyze this product quiz and provide actionable improvement suggestions.

Quiz: "${quiz.title}"

Performance metrics (last 90 days):
- Total sessions: ${totalSessions}
- Completion rate: ${completionRate.toFixed(1)}%
- Post-quiz conversion rate: ${conversionRate.toFixed(1)}%
- Total attributed revenue: $${totalRevenue.toFixed(2)}
- Total attributed orders: ${totalOrders}

Quiz structure with answer distribution:
${quizStructure}

Provide exactly 3-5 specific, actionable recommendations to improve this quiz's completion rate and conversion rate.

Return ONLY valid JSON in this format:
{
  "overall_assessment": "2-3 sentence summary of quiz health",
  "suggestions": [
    {
      "priority": "high|medium|low",
      "category": "question_wording|answer_options|quiz_length|result_relevance|flow",
      "title": "Short title",
      "description": "Specific actionable description (2-3 sentences)",
      "expected_impact": "What improvement to expect"
    }
  ]
}`;

  try {
    const message = await openai.chat.completions.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let jsonStr = message.choices[0].message.content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const advice = JSON.parse(jsonStr);

    return json({
      success: true,
      advice,
      metrics: {
        totalSessions,
        completionRate: Math.round(completionRate * 10) / 10,
        conversionRate: Math.round(conversionRate * 10) / 10,
        totalRevenue,
        totalOrders,
      },
    });
  } catch (err) {
    console.error("[Quiz Advisor] Error:", err);
    return json({ error: "Failed to generate advice. Please try again." }, { status: 500 });
  }
};
