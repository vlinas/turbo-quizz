import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSchema() {
  const quizzes = await prisma.quiz.findMany({
    select: {
      id: true,
      quiz_id: true,
      shop: true,
      title: true,
    },
    orderBy: {
      quiz_id: 'asc',
    },
  });

  console.log('\n=== All Quizzes (Global) ===');
  quizzes.forEach(q => {
    console.log(`DB ID: ${q.id} | Quiz ID: ${q.quiz_id} | Shop: ${q.shop} | Title: "${q.title}"`);
  });

  await prisma.$disconnect();
}

checkSchema().catch(console.error);
