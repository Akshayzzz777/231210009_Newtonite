ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (
    CASE "role"::text
      WHEN 'USER' THEN 'MEMBER'
      ELSE "role"::text
    END
  )::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "UserRole_old";

ALTER TYPE "TeamRole" RENAME TO "TeamRole_old";
CREATE TYPE "TeamRole" AS ENUM ('TEAM_LEAD', 'MEMBER', 'APPROVER');

ALTER TABLE "TeamMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TeamMember"
  ALTER COLUMN "role" TYPE "TeamRole"
  USING (
    CASE "role"::text
      WHEN 'OWNER' THEN 'TEAM_LEAD'
      ELSE "role"::text
    END
  )::"TeamRole";
ALTER TABLE "TeamMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "TeamRole_old";
