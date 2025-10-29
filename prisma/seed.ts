import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (optional - remove if you want to keep data)
  console.log('🧹 Cleaning existing data...');
  await prisma.answerSelection.deleteMany();
  await prisma.quizSession.deleteMany();
  await prisma.quizAnalyticsSummary.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();

  // Create sample quiz
  console.log('📝 Creating sample quiz...');
  const quiz = await prisma.quiz.create({
    data: {
      shop: 'example-store.myshopify.com',
      quiz_id: 'quiz-001',
      title: 'Find Your Perfect Product',
      description: 'Answer a few questions to discover products that match your style',
      status: 'active',
      display_on_pages: ['product', 'home'],
      theme_settings: {
        primaryColor: '#6366f1',
        buttonStyle: 'rounded',
      },
    },
  });
  console.log(`✅ Created quiz: ${quiz.title}`);

  // Create Question 1
  console.log('❓ Creating questions...');
  const question1 = await prisma.question.create({
    data: {
      quiz_id: quiz.quiz_id,
      question_id: 'q1-style',
      question_text: "What's your style preference?",
      order: 1,
    },
  });

  // Create Question 2
  const question2 = await prisma.question.create({
    data: {
      quiz_id: quiz.quiz_id,
      question_id: 'q2-usage',
      question_text: 'How will you use this product?',
      order: 2,
    },
  });
  console.log(`✅ Created ${2} questions`);

  // Create Answers for Question 1
  console.log('💬 Creating answers...');
  const answer1_1 = await prisma.answer.create({
    data: {
      question_id: question1.question_id,
      answer_id: 'a1-minimalist',
      answer_text: 'Minimalist & Clean',
      order: 1,
      action_type: 'show_text',
      action_data: {
        type: 'show_text',
        text: 'Great choice! You appreciate simplicity and elegance.',
        styling: {
          backgroundColor: '#f8f9fa',
          textColor: '#212529',
        },
      },
    },
  });

  const answer1_2 = await prisma.answer.create({
    data: {
      question_id: question1.question_id,
      answer_id: 'a1-bold',
      answer_text: 'Bold & Colorful',
      order: 2,
      action_type: 'show_products',
      action_data: {
        type: 'show_products',
        product_ids: [
          'gid://shopify/Product/123456',
          'gid://shopify/Product/789012',
        ],
        display_style: 'grid',
        columns: 2,
        show_prices: true,
        show_add_to_cart: true,
      },
    },
  });

  // Create Answers for Question 2
  const answer2_1 = await prisma.answer.create({
    data: {
      question_id: question2.question_id,
      answer_id: 'a2-everyday',
      answer_text: 'Everyday Use',
      order: 1,
      action_type: 'show_collections',
      action_data: {
        type: 'show_collections',
        collection_ids: ['gid://shopify/Collection/111222'],
        display_style: 'carousel',
        products_per_collection: 4,
        show_collection_title: true,
      },
    },
  });

  const answer2_2 = await prisma.answer.create({
    data: {
      question_id: question2.question_id,
      answer_id: 'a2-special',
      answer_text: 'Special Occasions',
      order: 2,
      action_type: 'show_text',
      action_data: {
        type: 'show_text',
        text: 'Perfect! Let me show you our premium collection.',
        html: '<h3>Premium Collection</h3><p>Handpicked items for those special moments.</p>',
      },
    },
  });
  console.log(`✅ Created ${4} answers`);

  // Create sample quiz sessions
  console.log('👥 Creating sample quiz sessions...');
  const session1 = await prisma.quizSession.create({
    data: {
      session_id: 'session-001',
      quiz_id: quiz.quiz_id,
      shop: quiz.shop,
      started_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      completed_at: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      is_completed: true,
      page_url: 'https://example-store.myshopify.com/',
      user_agent: 'Mozilla/5.0',
    },
  });

  const session2 = await prisma.quizSession.create({
    data: {
      session_id: 'session-002',
      quiz_id: quiz.quiz_id,
      shop: quiz.shop,
      started_at: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      is_completed: false,
      page_url: 'https://example-store.myshopify.com/products/example',
    },
  });
  console.log(`✅ Created ${2} quiz sessions`);

  // Create answer selections
  console.log('🎯 Recording answer selections...');
  await prisma.answerSelection.create({
    data: {
      session_id: session1.session_id,
      answer_id: answer1_1.answer_id,
      question_id: question1.question_id,
      quiz_id: quiz.quiz_id,
      shop: quiz.shop,
      selected_at: new Date(Date.now() - 55 * 60 * 1000),
    },
  });

  await prisma.answerSelection.create({
    data: {
      session_id: session1.session_id,
      answer_id: answer2_1.answer_id,
      question_id: question2.question_id,
      quiz_id: quiz.quiz_id,
      shop: quiz.shop,
      selected_at: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  await prisma.answerSelection.create({
    data: {
      session_id: session2.session_id,
      answer_id: answer1_2.answer_id,
      question_id: question1.question_id,
      quiz_id: quiz.quiz_id,
      shop: quiz.shop,
      selected_at: new Date(Date.now() - 3 * 60 * 1000),
    },
  });
  console.log(`✅ Recorded ${3} answer selections`);

  // Create analytics summary
  console.log('📊 Creating analytics data...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.quizAnalyticsSummary.createMany({
    data: [
      {
        quiz_id: quiz.quiz_id,
        shop: quiz.shop,
        date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
        impressions: 150,
        starts: 45,
        completions: 32,
      },
      {
        quiz_id: quiz.quiz_id,
        shop: quiz.shop,
        date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000),
        impressions: 200,
        starts: 60,
        completions: 48,
      },
      {
        quiz_id: quiz.quiz_id,
        shop: quiz.shop,
        date: today,
        impressions: 100,
        starts: 30,
        completions: 20,
      },
    ],
  });
  console.log(`✅ Created ${3} days of analytics data`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📈 Summary:');
  console.log(`   - 1 quiz created`);
  console.log(`   - 2 questions created`);
  console.log(`   - 4 answers created`);
  console.log(`   - 2 quiz sessions created`);
  console.log(`   - 3 answer selections recorded`);
  console.log(`   - 3 days of analytics data created`);
  console.log('\n✨ You can now test your quiz app with this sample data!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
