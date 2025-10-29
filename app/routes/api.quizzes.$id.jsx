import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GET /api/quizzes/:id - Get a specific quiz
 * PUT /api/quizzes/:id - Update a quiz
 * DELETE /api/quizzes/:id - Delete a quiz (soft delete)
 */

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  try {
    const quiz = await prisma.quiz.findFirst({
      where: {
        quiz_id: id,
        shop: session.shop,
        deleted_at: null,
      },
      include: {
        questions: {
          include: {
            answers: {
              orderBy: {
                order: 'asc',
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!quiz) {
      return json({
        success: false,
        error: "Quiz not found"
      }, { status: 404 });
    }

    // Get session stats
    const sessions = await prisma.quizSession.findMany({
      where: { quiz_id: quiz.quiz_id },
      select: {
        is_completed: true,
        started_at: true,
        completed_at: true,
      },
    });

    const stats = {
      totalSessions: sessions.length,
      completedSessions: sessions.filter((s) => s.is_completed).length,
      completionRate: sessions.length > 0
        ? Math.round((sessions.filter((s) => s.is_completed).length / sessions.length) * 100)
        : 0,
    };

    return json({
      success: true,
      quiz: {
        ...quiz,
        stats,
      }
    });
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return json({
      success: false,
      error: "Failed to fetch quiz"
    }, { status: 500 });
  }
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  // Verify quiz belongs to this shop
  const quiz = await prisma.quiz.findFirst({
    where: {
      quiz_id: id,
      shop: session.shop,
      deleted_at: null,
    },
  });

  if (!quiz) {
    return json({
      success: false,
      error: "Quiz not found"
    }, { status: 404 });
  }

  // Handle different HTTP methods
  if (request.method === "PUT") {
    return handleUpdate(request, id);
  } else if (request.method === "DELETE") {
    return handleDelete(id);
  }

  return json({
    success: false,
    error: "Method not allowed"
  }, { status: 405 });
}

async function handleUpdate(request, quizId) {
  try {
    const data = await request.json();
    const { title, description, status, display_on_pages, theme_settings } = data;

    const updatedQuiz = await prisma.quiz.update({
      where: { quiz_id: quizId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(display_on_pages && { display_on_pages }),
        ...(theme_settings !== undefined && { theme_settings }),
        updated_at: new Date(),
      },
      include: {
        questions: {
          include: {
            answers: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    return json({
      success: true,
      quiz: updatedQuiz,
      message: "Quiz updated successfully"
    });
  } catch (error) {
    console.error("Error updating quiz:", error);
    return json({
      success: false,
      error: "Failed to update quiz"
    }, { status: 500 });
  }
}

async function handleDelete(quizId) {
  try {
    // Soft delete
    await prisma.quiz.update({
      where: { quiz_id: quizId },
      data: {
        deleted_at: new Date(),
      },
    });

    return json({
      success: true,
      message: "Quiz deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting quiz:", error);
    return json({
      success: false,
      error: "Failed to delete quiz"
    }, { status: 500 });
  }
}
