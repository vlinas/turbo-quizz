import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Storefront API to fetch quiz data
 * GET /api/quiz/:quizId - Get quiz with questions and answers (no authentication)
 */

export async function loader({ params }) {
  const { quizId } = params;

  if (!quizId) {
    return json(
      {
        success: false,
        error: "Quiz ID is required",
      },
      { status: 400 }
    );
  }

  try {
    // Fetch quiz with questions and answers
    const quiz = await prisma.quiz.findFirst({
      where: {
        quiz_id: quizId,
        status: "active",
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
          error: "Quiz not found or not active",
        },
        { status: 404 }
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

    return json({
      success: true,
      quiz: formattedQuiz,
    });
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return json(
      {
        success: false,
        error: "Failed to fetch quiz",
      },
      { status: 500 }
    );
  }
}
