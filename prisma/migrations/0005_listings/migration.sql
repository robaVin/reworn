-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('draft', 'published', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "listing_condition" AS ENUM ('new', 'like_new', 'very_good', 'good', 'fair');

-- CreateEnum
CREATE TYPE "listing_gender" AS ENUM ('women', 'men', 'kids', 'unisex');

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "size" TEXT NOT NULL,
    "color" TEXT,
    "material" TEXT,
    "condition" "listing_condition" NOT NULL,
    "gender" "listing_gender" NOT NULL DEFAULT 'unisex',
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MKD',
    "original_price_minor" INTEGER,
    "location" TEXT NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listings_status_created_at_idx" ON "listings"("status", "created_at");

-- CreateIndex
CREATE INDEX "listings_seller_id_status_idx" ON "listings"("seller_id", "status");

-- CreateIndex
CREATE INDEX "listings_category_id_status_idx" ON "listings"("category_id", "status");

-- CreateIndex
CREATE INDEX "listings_status_gender_idx" ON "listings"("status", "gender");

-- CreateIndex
CREATE INDEX "listings_status_price_minor_idx" ON "listings"("status", "price_minor");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

