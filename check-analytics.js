import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAnalytics() {
  // Get all quiz sessions
  const sessions = await prisma.quizSession.findMany({
    orderBy: { started_at: 'desc' },
    take: 10,
  });

  console.log('\n=== Recent Quiz Sessions ===');
  console.log(JSON.stringify(sessions, null, 2));

  // Get all answer selections
  const selections = await prisma.answerSelection.findMany({
    orderBy: { selected_at: 'desc' },
    take: 10,
  });

  console.log('\n=== Recent Answer Selections ===');
  console.log(JSON.stringify(selections, null, 2));

  // Get analytics summary
  const summaries = await prisma.quizAnalyticsSummary.findMany({
    orderBy: { date: 'desc' },
    take: 5,
  });

  console.log('\n=== Recent Analytics Summaries ===');
  console.log(JSON.stringify(summaries, null, 2));

  await prisma.$disconnect();
}

checkAnalytics().catch(console.error);
