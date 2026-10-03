ALTER TABLE "WorkItem"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyHash" TEXT;

CREATE UNIQUE INDEX "WorkItem_idempotencyKey_key" ON "WorkItem"("idempotencyKey");