CREATE TYPE "WorkItemType" AS ENUM ('TASK', 'BUG', 'FEATURE', 'INCIDENT');

ALTER TABLE "WorkItem"
  ADD COLUMN "type" "WorkItemType" NOT NULL DEFAULT 'TASK',
  ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "ownerId" TEXT;

UPDATE "WorkItem"
SET
  "dueDate" = "dueAt",
  "ownerId" = "assigneeId";

ALTER TABLE "WorkItem" DROP COLUMN "dueAt";

CREATE INDEX "WorkItem_teamId_type_idx" ON "WorkItem"("teamId", "type");
CREATE INDEX "WorkItem_ownerId_status_idx" ON "WorkItem"("ownerId", "status");
CREATE INDEX "WorkItem_dueDate_idx" ON "WorkItem"("dueDate");

ALTER TABLE "WorkItem"
  ADD CONSTRAINT "WorkItem_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
