-- AlterTable
ALTER TABLE "Quiz" DROP COLUMN IF EXISTS "status";

-- DropIndex
DROP INDEX IF EXISTS "Quiz_status_idx";
