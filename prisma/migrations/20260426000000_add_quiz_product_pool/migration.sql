-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN "pool_type" TEXT;
ALTER TABLE "Quiz" ADD COLUMN "product_pool" JSONB;
ALTER TABLE "Quiz" ADD COLUMN "collection_pool" JSONB;
