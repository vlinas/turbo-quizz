import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function countData() {
  const quizzes = await prisma.quiz.findMany({
    select: {
      quiz_id: true,
      title: true,
      shop: true,
    },
  });

  console.log('\n=== All Quizzes ===');
  quizzes.forEach(q => {
    console.log(`Quiz ${q.quiz_id}: "${q.title}" - ${q.shop}`);
  });

  console.log('\n=== Session Count by Quiz ===');
  const sessionCounts = await prisma.quizSession.groupBy({
    by: ['quiz_id', 'shop'],
    _count: true,
  });
  
  sessionCounts.forEach(s => {
    console.log(`Quiz ${s.quiz_id} (${s.shop}): ${s._count} sessions`);
  });

  console.log('\n=== Answer Selection Count by Quiz ===');
  const selectionCounts = await prisma.answerSelection.groupBy({
    by: ['quiz_id', 'shop'],
    _count: true,
  });
  
  selectionCounts.forEach(s => {
    console.log(`Quiz ${s.quiz_id} (${s.shop}): ${s._count} selections`);
  });

  await prisma.$disconnect();
}

countData().catch(console.error);
