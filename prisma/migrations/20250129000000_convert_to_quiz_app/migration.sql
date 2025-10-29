-- Drop old discount tables
DROP TABLE IF EXISTS "discount_coupons_codes" CASCADE;
DROP TABLE IF EXISTS "discount_coupons" CASCADE;
DROP TABLE IF EXISTS "orders" CASCADE;
DROP TABLE IF EXISTS "analytics" CASCADE;

-- CreateTable: Quiz
CREATE TABLE "Quiz" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "display_on_pages" TEXT[],
    "theme_settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Question
CREATE TABLE "Question" (
    "id" SERIAL NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Answer
CREATE TABLE "Answer" (
    "id" SERIAL NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer_id" TEXT NOT NULL,
    "answer_text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "action_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QuizSession
CREATE TABLE "QuizSession" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "customer_id" TEXT,
    "page_url" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AnswerSelection
CREATE TABLE "AnswerSelection" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "answer_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QuizAnalyticsSummary
CREATE TABLE "QuizAnalyticsSummary" (
    "id" SERIAL NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "starts" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizAnalyticsSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_quiz_id_key" ON "Quiz"("quiz_id");
CREATE INDEX "Quiz_shop_idx" ON "Quiz"("shop");
CREATE INDEX "Quiz_status_idx" ON "Quiz"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Question_question_id_key" ON "Question"("question_id");
CREATE INDEX "Question_quiz_id_idx" ON "Question"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_answer_id_key" ON "Answer"("answer_id");
CREATE INDEX "Answer_question_id_idx" ON "Answer"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "QuizSession_session_id_key" ON "QuizSession"("session_id");
CREATE INDEX "QuizSession_quiz_id_idx" ON "QuizSession"("quiz_id");
CREATE INDEX "QuizSession_shop_idx" ON "QuizSession"("shop");
CREATE INDEX "QuizSession_started_at_idx" ON "QuizSession"("started_at");

-- CreateIndex
CREATE INDEX "AnswerSelection_session_id_idx" ON "AnswerSelection"("session_id");
CREATE INDEX "AnswerSelection_answer_id_idx" ON "AnswerSelection"("answer_id");
CREATE INDEX "AnswerSelection_quiz_id_selected_at_idx" ON "AnswerSelection"("quiz_id", "selected_at");
CREATE INDEX "AnswerSelection_shop_selected_at_idx" ON "AnswerSelection"("shop", "selected_at");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAnalyticsSummary_quiz_id_shop_date_key" ON "QuizAnalyticsSummary"("quiz_id", "shop", "date");
CREATE INDEX "QuizAnalyticsSummary_shop_date_idx" ON "QuizAnalyticsSummary"("shop", "date");
CREATE INDEX "QuizAnalyticsSummary_quiz_id_date_idx" ON "QuizAnalyticsSummary"("quiz_id", "date");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("quiz_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("quiz_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSelection" ADD CONSTRAINT "AnswerSelection_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "QuizSession"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSelection" ADD CONSTRAINT "AnswerSelection_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "Answer"("answer_id") ON DELETE CASCADE ON UPDATE CASCADE;
