import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCompletions() {
  try {
    // Get total sessions
    const totalSessions = await prisma.quizSession.count();

    // Get completed sessions
    const completedSessions = await prisma.quizSession.count({
      where: {
        is_completed: true
      }
    });

    // Get sessions by quiz
    const sessionsByQuiz = await prisma.quizSession.groupBy({
      by: ['quiz_id', 'is_completed'],
      _count: {
        _all: true
      }
    });

    console.log('\n=== Session Statistics ===');
    console.log(`Total sessions: ${totalSessions}`);
    console.log(`Completed sessions: ${completedSessions}`);
    console.log(`Completion rate: ${totalSessions > 0 ? ((completedSessions / totalSessions) * 100).toFixed(2) : 0}%`);

    console.log('\n=== Sessions by Quiz ===');
    sessionsByQuiz.forEach(stat => {
      console.log(`Quiz ID: ${stat.quiz_id}, Completed: ${stat.is_completed}, Count: ${stat._count._all}`);
    });

    // Sample some recent sessions
    const recentSessions = await prisma.quizSession.findMany({
      take: 10,
      orderBy: {
        started_at: 'desc'
      },
      select: {
        session_id: true,
        quiz_id: true,
        is_completed: true,
        completed_at: true,
        started_at: true
      }
    });

    console.log('\n=== Recent Sessions (last 10) ===');
    recentSessions.forEach(session => {
      console.log(`${session.session_id}: Quiz ${session.quiz_id}, Completed: ${session.is_completed}, ${session.is_completed ? `at ${session.completed_at}` : 'not completed'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCompletions();
