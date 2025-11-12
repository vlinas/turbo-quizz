import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findSession() {
  const sessionId = 'session-1762880939842-87cize333';
  
  const session = await prisma.quizSession.findUnique({
    where: { session_id: sessionId },
    include: {
      answer_selections: true,
    },
  });

  console.log('\n=== Session Found ===');
  console.log(JSON.stringify(session, null, 2));

  // Also check all sessions from the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentSessions = await prisma.quizSession.findMany({
    where: {
      started_at: { gte: oneHourAgo },
    },
    include: {
      answer_selections: true,
    },
    orderBy: { started_at: 'desc' },
  });

  console.log('\n=== Recent Sessions (last hour) ===');
  console.log(`Found ${recentSessions.length} sessions`);
  recentSessions.forEach(s => {
    console.log(`- ${s.session_id}: quiz ${s.quiz_id}, completed: ${s.is_completed}, selections: ${s.answer_selections.length}`);
  });

  await prisma.$disconnect();
}

findSession().catch(console.error);
