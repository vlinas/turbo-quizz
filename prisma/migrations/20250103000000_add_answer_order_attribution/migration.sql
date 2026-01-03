-- CreateTable: Answer-level order attribution for detailed revenue analytics
-- Enables data warehouse queries like:
-- - Revenue per answer per day
-- - Answer conversion rates over time
-- - A/B testing of answer performance

CREATE TABLE "AnswerOrderAttribution" (
    "id" SERIAL NOT NULL,
    "order_attribution_id" INTEGER NOT NULL,
    "answer_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "shop" TEXT NOT NULL,
    "answer_text" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_total" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "order_date" DATE NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL,
    "attributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerOrderAttribution_pkey" PRIMARY KEY ("id")
);

-- Unique constraint to prevent duplicate answer attributions per order
CREATE UNIQUE INDEX "AnswerOrderAttribution_order_attribution_id_answer_id_key" ON "AnswerOrderAttribution"("order_attribution_id", "answer_id");

-- Indexes optimized for data warehouse queries
CREATE INDEX "AnswerOrderAttribution_answer_id_order_date_idx" ON "AnswerOrderAttribution"("answer_id", "order_date");
CREATE INDEX "AnswerOrderAttribution_question_id_order_date_idx" ON "AnswerOrderAttribution"("question_id", "order_date");
CREATE INDEX "AnswerOrderAttribution_quiz_id_shop_order_date_idx" ON "AnswerOrderAttribution"("quiz_id", "shop", "order_date");
CREATE INDEX "AnswerOrderAttribution_shop_order_date_idx" ON "AnswerOrderAttribution"("shop", "order_date");
CREATE INDEX "AnswerOrderAttribution_answer_id_shop_idx" ON "AnswerOrderAttribution"("answer_id", "shop");

-- Foreign key constraints
ALTER TABLE "AnswerOrderAttribution" ADD CONSTRAINT "AnswerOrderAttribution_order_attribution_id_fkey" FOREIGN KEY ("order_attribution_id") REFERENCES "QuizOrderAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerOrderAttribution" ADD CONSTRAINT "AnswerOrderAttribution_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "Answer"("answer_id") ON DELETE CASCADE ON UPDATE CASCADE;
