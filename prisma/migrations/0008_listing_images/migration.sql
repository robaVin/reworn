-- CreateTable
CREATE TABLE "listing_images" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_images_storage_key_key" ON "listing_images"("storage_key");

-- CreateIndex
CREATE INDEX "listing_images_listing_id_position_idx" ON "listing_images"("listing_id", "position");

-- AddForeignKey
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

