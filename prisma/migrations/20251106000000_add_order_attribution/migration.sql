-- Add order attribution table for revenue tracking
CREATE TABLE "QuizOrderAttribution" (
    "id" SERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT,
    "session_id" TEXT NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "shop" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_email" TEXT,
    "total_price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "line_items_count" INTEGER NOT NULL DEFAULT 0,
    "order_created_at" TIMESTAMP(3) NOT NULL,
    "attributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizOrderAttribution_pkey" PRIMARY KEY ("id")
);

-- Create indexes for efficient queries
CREATE UNIQUE INDEX "QuizOrderAttribution_order_id_shop_key" ON "QuizOrderAttribution"("order_id", "shop");
CREATE INDEX "QuizOrderAttribution_session_id_idx" ON "QuizOrderAttribution"("session_id");
CREATE INDEX "QuizOrderAttribution_quiz_id_shop_idx" ON "QuizOrderAttribution"("quiz_id", "shop");
CREATE INDEX "QuizOrderAttribution_shop_order_created_at_idx" ON "QuizOrderAttribution"("shop", "order_created_at");

-- Add foreign key constraint
ALTER TABLE "QuizOrderAttribution" ADD CONSTRAINT "QuizOrderAttribution_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "QuizSession"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;
