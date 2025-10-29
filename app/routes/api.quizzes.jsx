import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GET /api/quizzes - List all quizzes for the shop
 * POST /api/quizzes - Create a new quiz
 */

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  try {
    const quizzes = await prisma.quiz.findMany({
      where: {
        shop: session.shop,
        deleted_at: null,
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
        _count: {
          select: {
            quiz_sessions: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Calculate completion stats for each quiz
    const quizzesWithStats = await Promise.all(
      quizzes.map(async (quiz) => {
        const sessions = await prisma.quizSession.findMany({
          where: { quiz_id: quiz.quiz_id },
          select: { is_completed: true },
        });

        const totalSessions = sessions.length;
        const completedSessions = sessions.filter((s) => s.is_completed).length;
        const completionRate = totalSessions > 0
          ? Math.round((completedSessions / totalSessions) * 100)
          : 0;

        return {
          ...quiz,
          stats: {
            totalSessions,
            completedSessions,
            completionRate,
          },
        };
      })
    );

    return json({
      success: true,
      quizzes: quizzesWithStats
    });
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    return json({
      success: false,
      error: "Failed to fetch quizzes"
    }, { status: 500 });
  }
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({
      success: false,
      error: "Method not allowed"
    }, { status: 405 });
  }

  try {
    const data = await request.json();
    const { title, description, status, display_on_pages, theme_settings } = data;

    // Validate required fields
    if (!title) {
      return json({
        success: false,
        error: "Title is required"
      }, { status: 400 });
    }

    // Create quiz
    const quiz = await prisma.quiz.create({
      data: {
        shop: session.shop,
        quiz_id: `quiz-${Date.now()}`, // Simple ID generation
        title,
        description: description || null,
        status: status || "draft",
        display_on_pages: display_on_pages || [],
        theme_settings: theme_settings || null,
      },
      include: {
        questions: {
          include: {
            answers: true,
          },
        },
      },
    });

    return json({
      success: true,
      quiz,
      message: "Quiz created successfully"
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating quiz:", error);
    return json({
      success: false,
      error: "Failed to create quiz"
    }, { status: 500 });
  }
}
