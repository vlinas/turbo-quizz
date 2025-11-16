import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkQuizDetails() {
  const quizzes = await prisma.quiz.findMany({
    include: {
      questions: {
        include: {
          answers: true,
        },
      },
    },
  });

  console.log('\n=== All Quizzes with Questions ===');
  quizzes.forEach(quiz => {
    console.log(`\nQuiz ID: ${quiz.quiz_id}`);
    console.log(`Title: ${quiz.title}`);
    console.log(`Shop: ${quiz.shop}`);
    console.log(`Questions:`);
    quiz.questions.forEach(q => {
      console.log(`  - Question ${q.question_id}: "${q.question_text}"`);
      q.answers.forEach(a => {
        console.log(`    * Answer ${a.answer_id}: "${a.answer_text}"`);
      });
    });
  });

  await prisma.$disconnect();
}

checkQuizDetails().catch(console.error);
