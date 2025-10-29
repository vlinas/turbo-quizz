-- AlterTable
ALTER TABLE "discount_coupons"
ADD COLUMN "button_style_type" TEXT DEFAULT 'sticker',
ADD COLUMN "standard_btn_border_color" TEXT,
ADD COLUMN "success_btn_border_color" TEXT;
