import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Storefront API to fetch quiz data
 * GET /api/quiz/:quizId - Get quiz with questions and answers (no authentication)
 */

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

    // Format response for storefront
    const formattedQuiz = {
      quiz_id: quiz.quiz_id,
      title: quiz.title,
      description: quiz.description,
      theme_settings: quiz.theme_settings,
      questions: quiz.questions.map((question) => ({
        question_id: question.question_id,
        question_text: question.question_text,
        order: question.order,
        answers: question.answers,
      })),
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
