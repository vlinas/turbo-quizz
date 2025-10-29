-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" INTEGER,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_coupons" (
    "id" SERIAL NOT NULL,
    "shop" TEXT,
    "coupon_id" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "prefix_code" TEXT NOT NULL,
    "code_length" INTEGER NOT NULL DEFAULT 6,
    "revenue" DECIMAL(16,2) DEFAULT 0.0,
    "quantity" INTEGER,
    "used" INTEGER DEFAULT 0,
    "discount_type" TEXT NOT NULL,
    "discount_value" TEXT,
    "target_type" TEXT,
    "target_selection" TEXT,
    "customer_selection" TEXT,
    "allocation_method" TEXT,
    "min_requirement_info" TEXT,
    "minimum_req" TEXT DEFAULT '0',
    "minimum_quantity_req" TEXT,
    "starts_at" TIMESTAMP(3),
    "starts_time" TEXT,
    "allocation_limit" TEXT,
    "applied_to" TEXT DEFAULT 'All',
    "prerequisite_collection_ids" JSONB,
    "entitled_product_ids" JSONB,
    "prerequisite_to_entitlement_quantity_ratio" JSONB,
    "expires" TIMESTAMP(3),
    "expires_time" TEXT,
    "end_date_checked" TEXT,
    "standard_btn_bg_color" TEXT,
    "standard_btn_text" TEXT,
    "standard_btn_text_color" TEXT,
    "success_btn_bg_color" TEXT,
    "success_btn_text" TEXT,
    "success_btn_text_color" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_coupons_codes" (
    "id" SERIAL NOT NULL,
    "shop" TEXT,
    "discount_coupon_id" TEXT,
    "batch_id" TEXT,
    "code" TEXT NOT NULL,
    "usable_qty" INTEGER DEFAULT 1,
    "used" INTEGER DEFAULT 0,
    "revealed" INTEGER DEFAULT 0,
    "revenue" DECIMAL(16,2) DEFAULT 0.0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_coupons_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "shop" TEXT,
    "order_id" TEXT,
    "line_items" JSONB,
    "currency" TEXT,
    "order_value" TEXT,
    "order_tax" JSONB,
    "discount_codes" JSONB,
    "discount_application" JSONB,
    "discount" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" SERIAL NOT NULL,
    "shop" TEXT,
    "order_id" TEXT,
    "discount_id" TEXT,
    "discount_value" TEXT,
    "order_value" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_coupons_coupon_id_key" ON "discount_coupons"("coupon_id");

-- CreateIndex
CREATE UNIQUE INDEX "discount_coupons_codes_code_key" ON "discount_coupons_codes"("code");

-- AddForeignKey
ALTER TABLE "discount_coupons_codes" ADD CONSTRAINT "discount_coupons_codes_discount_coupon_id_fkey" FOREIGN KEY ("discount_coupon_id") REFERENCES "discount_coupons"("coupon_id") ON DELETE SET NULL ON UPDATE CASCADE;
