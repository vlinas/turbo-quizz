-- This is a breaking migration that changes quiz_id from UUID to Integer
-- All existing quiz data will be cleared

-- Drop existing foreign key constraints
ALTER TABLE "Question" DROP CONSTRAINT IF EXISTS "Question_quiz_id_fkey";
ALTER TABLE "QuizSession" DROP CONSTRAINT IF EXISTS "QuizSession_quiz_id_fkey";

-- Clear all data (since we're changing primary key structure)
TRUNCATE TABLE "AnswerSelection" CASCADE;
TRUNCATE TABLE "Answer" CASCADE;
TRUNCATE TABLE "Question" CASCADE;
TRUNCATE TABLE "QuizSession" CASCADE;
TRUNCATE TABLE "QuizAnalyticsSummary" CASCADE;
TRUNCATE TABLE "Quiz" CASCADE;

-- Drop old indexes on Quiz
DROP INDEX IF EXISTS "Quiz_quiz_id_key";

-- Alter Quiz table
ALTER TABLE "Quiz" DROP COLUMN IF EXISTS "quiz_id";
ALTER TABLE "Quiz" ADD COLUMN "quiz_id" INTEGER NOT NULL DEFAULT 1;

-- Create unique constraint on shop + quiz_id
CREATE UNIQUE INDEX "Quiz_shop_quiz_id_key" ON "Quiz"("shop", "quiz_id");

-- Alter Question table
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "shop" TEXT;
UPDATE "Question" SET "shop" = '' WHERE "shop" IS NULL;
ALTER TABLE "Question" ALTER COLUMN "shop" SET NOT NULL;

ALTER TABLE "Question" DROP COLUMN IF EXISTS "quiz_id";
ALTER TABLE "Question" ADD COLUMN "quiz_id" INTEGER NOT NULL DEFAULT 1;

-- Recreate Question foreign key with composite key
ALTER TABLE "Question" ADD CONSTRAINT "Question_shop_quiz_id_fkey"
  FOREIGN KEY ("shop", "quiz_id") REFERENCES "Quiz"("shop", "quiz_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old index and create new one
DROP INDEX IF EXISTS "Question_quiz_id_idx";
CREATE INDEX "Question_quiz_id_shop_idx" ON "Question"("quiz_id", "shop");

-- Alter QuizSession table
ALTER TABLE "QuizSession" DROP COLUMN IF EXISTS "quiz_id";
ALTER TABLE "QuizSession" ADD COLUMN "quiz_id" INTEGER NOT NULL DEFAULT 1;

-- Recreate QuizSession foreign key
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_shop_quiz_id_fkey"
  FOREIGN KEY ("shop", "quiz_id") REFERENCES "Quiz"("shop", "quiz_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old index and create new one
DROP INDEX IF EXISTS "QuizSession_quiz_id_idx";
CREATE INDEX "QuizSession_quiz_id_shop_idx" ON "QuizSession"("quiz_id", "shop");

-- Alter AnswerSelection table
ALTER TABLE "AnswerSelection" DROP COLUMN IF EXISTS "quiz_id";
ALTER TABLE "AnswerSelection" ADD COLUMN "quiz_id" INTEGER NOT NULL DEFAULT 1;

-- Drop old index and create new one
DROP INDEX IF EXISTS "AnswerSelection_quiz_id_selected_at_idx";
CREATE INDEX "AnswerSelection_quiz_id_shop_selected_at_idx" ON "AnswerSelection"("quiz_id", "shop", "selected_at");

-- Alter QuizAnalyticsSummary table
ALTER TABLE "QuizAnalyticsSummary" DROP CONSTRAINT IF EXISTS "QuizAnalyticsSummary_quiz_id_shop_date_key";
DROP INDEX IF EXISTS "QuizAnalyticsSummary_quiz_id_date_idx";

ALTER TABLE "QuizAnalyticsSummary" DROP COLUMN IF EXISTS "quiz_id";
ALTER TABLE "QuizAnalyticsSummary" ADD COLUMN "quiz_id" INTEGER NOT NULL DEFAULT 1;

-- Recreate constraints
CREATE UNIQUE INDEX "QuizAnalyticsSummary_quiz_id_shop_date_key" ON "QuizAnalyticsSummary"("quiz_id", "shop", "date");
CREATE INDEX "QuizAnalyticsSummary_quiz_id_shop_date_idx" ON "QuizAnalyticsSummary"("quiz_id", "shop", "date");
