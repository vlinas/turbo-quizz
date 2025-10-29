import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GET /api/analytics/:quizId - Get analytics for a specific quiz
 * Includes: completion rates, popular answers, daily performance
 */

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);
  const { quizId } = params;

  try {
    // Verify quiz belongs to this shop
    const quiz = await prisma.quiz.findFirst({
      where: {
        quiz_id: quizId,
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
      },
    });

    if (!quiz) {
      return json({
        success: false,
        error: "Quiz not found"
      }, { status: 404 });
    }

    // Get all sessions for this quiz
    const sessions = await prisma.quizSession.findMany({
      where: { quiz_id: quizId },
      include: {
        answer_selections: {
          include: {
            answer: true,
          },
        },
      },
    });

    // Calculate overall stats
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.is_completed).length;
    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;

    // Calculate average completion time (for completed sessions)
    const completedWithTime = sessions.filter(
      (s) => s.is_completed && s.started_at && s.completed_at
    );
    const avgCompletionTime = completedWithTime.length > 0
      ? Math.round(
          completedWithTime.reduce((sum, s) => {
            const duration = new Date(s.completed_at) - new Date(s.started_at);
            return sum + duration / 1000; // Convert to seconds
          }, 0) / completedWithTime.length
        )
      : 0;

    // Calculate popular answers for each question
    const answerStats = quiz.questions.map((question) => {
      const selections = sessions.flatMap((s) =>
        s.answer_selections.filter((sel) => sel.question_id === question.question_id)
      );

      const answerCounts = question.answers.map((answer) => {
        const count = selections.filter((sel) => sel.answer_id === answer.answer_id).length;
        const percentage = selections.length > 0
          ? Math.round((count / selections.length) * 100)
          : 0;

        return {
          answer_id: answer.answer_id,
          answer_text: answer.answer_text,
          selection_count: count,
          selection_percentage: percentage,
        };
      });

      return {
        question_id: question.question_id,
        question_text: question.question_text,
        total_responses: selections.length,
        answers: answerCounts.sort((a, b) => b.selection_count - a.selection_count),
      };
    });

    // Get daily performance (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyStats = await prisma.quizAnalyticsSummary.findMany({
      where: {
        quiz_id: quizId,
        shop: session.shop,
        date: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Format daily stats with completion rate
    const dailyPerformance = dailyStats.map((stat) => ({
      date: stat.date.toISOString().split('T')[0], // YYYY-MM-DD format
      impressions: stat.impressions,
      starts: stat.starts,
      completions: stat.completions,
      completion_rate: stat.starts > 0
        ? Math.round((stat.completions / stat.starts) * 100)
        : 0,
    }));

    return json({
      success: true,
      analytics: {
        quiz_id: quizId,
        quiz_title: quiz.title,
        overall: {
          total_sessions: totalSessions,
          completed_sessions: completedSessions,
          completion_rate: completionRate,
          average_completion_time: avgCompletionTime,
        },
        answer_stats: answerStats,
        daily_performance: dailyPerformance,
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return json({
      success: false,
      error: "Failed to fetch analytics"
    }, { status: 500 });
  }
}
