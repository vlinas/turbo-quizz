const { PrismaClient } = require('@prisma/client');

async function syncDatabaseSchema() {
  const prisma = new PrismaClient();

  try {
    // Create the ShopPlan table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShopPlan" (
        id SERIAL PRIMARY KEY,
        shop TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'free' NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('ShopPlan table: OK');

    // Add metafield_key column to Question table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS metafield_key TEXT;
    `);
    console.log('Question.metafield_key column: OK');

    // Create AnswerOrderAttribution table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AnswerOrderAttribution" (
        id SERIAL PRIMARY KEY,
        order_attribution_id INTEGER NOT NULL,
        answer_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        quiz_id INTEGER NOT NULL,
        shop TEXT NOT NULL,
        answer_text TEXT NOT NULL,
        question_text TEXT NOT NULL,
        order_id TEXT NOT NULL,
        order_total DECIMAL(10, 2) NOT NULL,
        currency TEXT DEFAULT 'USD' NOT NULL,
        order_date DATE NOT NULL,
        selected_at TIMESTAMP NOT NULL,
        attributed_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(order_attribution_id, answer_id)
      );
    `);
    console.log('AnswerOrderAttribution table: OK');

    // Add foreign keys if they don't exist (silently fail if they do)
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AnswerOrderAttribution"
        ADD CONSTRAINT "AnswerOrderAttribution_order_attribution_id_fkey"
        FOREIGN KEY (order_attribution_id) REFERENCES "QuizOrderAttribution"(id) ON DELETE CASCADE;
      `);
    } catch (e) { /* constraint may already exist */ }

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AnswerOrderAttribution"
        ADD CONSTRAINT "AnswerOrderAttribution_answer_id_fkey"
        FOREIGN KEY (answer_id) REFERENCES "Answer"(answer_id) ON DELETE CASCADE;
      `);
    } catch (e) { /* constraint may already exist */ }

    // Create indexes for AnswerOrderAttribution
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AnswerOrderAttribution_answer_id_order_date_idx" ON "AnswerOrderAttribution"(answer_id, order_date);`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AnswerOrderAttribution_question_id_order_date_idx" ON "AnswerOrderAttribution"(question_id, order_date);`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AnswerOrderAttribution_quiz_id_shop_order_date_idx" ON "AnswerOrderAttribution"(quiz_id, shop, order_date);`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AnswerOrderAttribution_shop_order_date_idx" ON "AnswerOrderAttribution"(shop, order_date);`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AnswerOrderAttribution_answer_id_shop_idx" ON "AnswerOrderAttribution"(answer_id, shop);`);
    } catch (e) { /* indexes may already exist */ }
    console.log('AnswerOrderAttribution indexes: OK');

    console.log('\n✅ Database schema sync complete!');

  } catch (error) {
    console.error('Error syncing schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

syncDatabaseSchema();
