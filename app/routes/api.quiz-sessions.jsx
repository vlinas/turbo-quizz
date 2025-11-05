import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Storefront API for quiz sessions
 * POST /api/quiz-sessions/start - Start a new quiz session
 * POST /api/quiz-sessions/answer - Record an answer selection
 * POST /api/quiz-sessions/complete - Mark session as completed
 */

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  // Handle OPTIONS requests for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  return json(
    { error: "Method not allowed. Use POST for actions." },
    {
      status: 405,
      headers: corsHeaders,
    }
  );
}

export async function action({ request }) {
  const { method } = request;

  try {
    const data = await request.json();
    const { action: actionType } = data;

    if (method !== "POST") {
      return json({
        success: false,
        error: "Method not allowed"
      }, {
        status: 405,
        headers: corsHeaders
      });
    }

    switch (actionType) {
      case "start":
        return handleStart(data);
      case "answer":
        return handleAnswer(data);
      case "complete":
        return handleComplete(data);
      default:
        return json({
          success: false,
          error: "Invalid action type"
        }, {
          status: 400,
          headers: corsHeaders
        });
    }
  } catch (error) {
    console.error("Error in quiz-sessions:", error);
    return json({
      success: false,
      error: "Internal server error"
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Start a new quiz session
 */
async function handleStart(data) {
  const { quiz_id, customer_id, page_url, user_agent } = data;

  if (!quiz_id) {
    return json({
      success: false,
      error: "quiz_id is required"
    }, {
      status: 400,
      headers: corsHeaders
    });
  }

  // Convert quiz_id to integer
  const parsedQuizId = parseInt(quiz_id, 10);
  if (isNaN(parsedQuizId)) {
    return json({
      success: false,
      error: "Invalid quiz_id format"
    }, {
      status: 400,
      headers: corsHeaders
    });
  }

  // Verify quiz exists (allow both active and draft for testing)
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: parsedQuizId,
      deleted_at: null,
    },
  });

  if (!quiz) {
    return json({
      success: false,
      error: "Quiz not found"
    }, {
      status: 404,
      headers: corsHeaders
    });
  }

  // Create session
  const session = await prisma.quizSession.create({
    data: {
      session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      quiz_id: parsedQuizId,
      shop: quiz.shop,
      customer_id: customer_id || null,
      page_url: page_url || null,
      user_agent: user_agent || null,
    },
  });

  // Update daily analytics (impressions/starts)
  await updateDailyAnalytics(parsedQuizId, quiz.shop, 'start');

  return json({
    success: true,
    session_id: session.session_id,
    message: "Quiz session started"
  }, {
    status: 201,
    headers: corsHeaders
  });
}

/**
 * Record an answer selection
 */
async function handleAnswer(data) {
  const { session_id, answer_id, question_id, quiz_id } = data;

  if (!session_id || !answer_id || !question_id || !quiz_id) {
    return json({
      success: false,
      error: "session_id, answer_id, question_id, and quiz_id are required"
    }, {
      status: 400,
      headers: corsHeaders
    });
  }

  // Verify session exists
  const session = await prisma.quizSession.findUnique({
    where: { session_id },
  });

  if (!session) {
    return json({
      success: false,
      error: "Session not found"
    }, {
      status: 404,
      headers: corsHeaders
    });
  }

  // Verify answer exists
  const answer = await prisma.answer.findUnique({
    where: { answer_id },
    include: {
      question: true,
    },
  });

  if (!answer) {
    return json({
      success: false,
      error: "Answer not found"
    }, {
      status: 404,
      headers: corsHeaders
    });
  }

  // Check if answer already recorded for this question in this session
  const existing = await prisma.answerSelection.findFirst({
    where: {
      session_id,
      question_id,
    },
  });

  if (existing) {
    // Update existing selection
    await prisma.answerSelection.update({
      where: { id: existing.id },
      data: {
        answer_id,
        selected_at: new Date(),
      },
    });
  } else {
    // Create new selection
    try {
      console.log('[Record Answer] Creating selection:', {
        session_id,
        answer_id,
        question_id,
        quiz_id,
        shop: session.shop,
      });
      await prisma.answerSelection.create({
        data: {
          session_id,
          answer_id,
          question_id,
          quiz_id,
          shop: session.shop,
        },
      });
      console.log('[Record Answer] Selection created successfully');
    } catch (error) {
      console.error('[Record Answer] Failed to create selection:', error.message);
      console.error('[Record Answer] Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  return json({
    success: true,
    action_data: answer.action_data,
    message: "Answer recorded"
  }, {
    headers: corsHeaders
  });
}

/**
 * Mark quiz session as completed
 */
async function handleComplete(data) {
  const { session_id } = data;

  if (!session_id) {
    return json({
      success: false,
      error: "session_id is required"
    }, {
      status: 400,
      headers: corsHeaders
    });
  }

  // Update session
  const session = await prisma.quizSession.update({
    where: { session_id },
    data: {
      is_completed: true,
      completed_at: new Date(),
    },
  });

  // Update daily analytics (completions)
  await updateDailyAnalytics(session.quiz_id, session.shop, 'complete');

  return json({
    success: true,
    message: "Quiz session completed"
  }, {
    headers: corsHeaders
  });
}

/**
 * Update daily analytics summary
 */
async function updateDailyAnalytics(quizId, shop, type) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find or create today's analytics record
  const existing = await prisma.quizAnalyticsSummary.findUnique({
    where: {
      quiz_id_shop_date: {
        quiz_id: quizId,
        shop: shop,
        date: today,
      },
    },
  });

  if (existing) {
    // Update existing record
    await prisma.quizAnalyticsSummary.update({
      where: { id: existing.id },
      data: {
        ...(type === 'start' && {
          impressions: existing.impressions + 1,
          starts: existing.starts + 1,
        }),
        ...(type === 'complete' && {
          completions: existing.completions + 1,
        }),
      },
    });
  } else {
    // Create new record
    await prisma.quizAnalyticsSummary.create({
      data: {
        quiz_id: quizId,
        shop: shop,
        date: today,
        impressions: type === 'start' ? 1 : 0,
        starts: type === 'start' ? 1 : 0,
        completions: type === 'complete' ? 1 : 0,
      },
    });
  }
}
