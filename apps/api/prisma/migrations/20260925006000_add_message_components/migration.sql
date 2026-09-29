-- Bot message components: buttons and select menus (docs/features/bot-message-components.md).
-- Reuses "Interaction"/"InteractionStatus" for a new MESSAGE_COMPONENT type alongside the existing
-- slash-command APPLICATION_COMMAND flow, instead of a second lifecycle table (Trade-offs).
--
-- Additive except one relaxed constraint:
--   * "Interaction"."commandId" drops NOT NULL — a component interaction has no SlashCommand row.
--     The existing "Interaction_commandId_fkey" (ON DELETE CASCADE) already tolerates NULL once the
--     NOT NULL constraint is dropped; a NULL foreign-key value is never subject to the CASCADE.
--     `ALTER COLUMN ... DROP NOT NULL` is a catalog-only change on Postgres — no table rewrite, and
--     the only lock is the brief ACCESS EXCLUSIVE held for the DDL statement itself. "Interaction"
--     rows are short-lived (claimed or swept within `INTERACTION_TIMEOUT_MS`), so the table stays
--     small regardless of server age.
--   * "Message"."components" is a new nullable column with no default — `ADD COLUMN ... NULL` is
--     also catalog-only on Postgres >= 11 (no rewrite of existing rows).
--   * The five new "Interaction" columns are nullable, and "type" backfills every existing row to
--     'APPLICATION_COMMAND' in the same statement that adds it, so no separate backfill/lock pass is
--     needed.
--
-- down() (data-destroying for any in-flight MESSAGE_COMPONENT interaction row and every message's
-- stored components; nothing else in the schema reads these columns):
--   ALTER TABLE "Message" DROP COLUMN "components";
--   DELETE FROM "Interaction" WHERE "type" = 'MESSAGE_COMPONENT'; -- would otherwise violate the
--                                                                 -- restored NOT NULL below
--   ALTER TABLE "Interaction" DROP COLUMN "type";
--   ALTER TABLE "Interaction" DROP COLUMN "messageId";
--   ALTER TABLE "Interaction" DROP COLUMN "customId";
--   ALTER TABLE "Interaction" DROP COLUMN "componentType";
--   ALTER TABLE "Interaction" DROP COLUMN "values";
--   ALTER TABLE "Interaction" ALTER COLUMN "commandId" SET NOT NULL;
--   DROP TYPE "InteractionType";

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('APPLICATION_COMMAND', 'MESSAGE_COMPONENT');

-- AlterTable: Message gains a nullable, bot-authored components column.
ALTER TABLE "Message" ADD COLUMN "components" JSONB;

-- AlterTable: Interaction gains a type discriminant (backfilled for every existing row) and the
-- MESSAGE_COMPONENT-only columns.
ALTER TABLE "Interaction" ADD COLUMN "type" "InteractionType" NOT NULL DEFAULT 'APPLICATION_COMMAND';
ALTER TABLE "Interaction" ADD COLUMN "messageId" TEXT;
ALTER TABLE "Interaction" ADD COLUMN "customId" TEXT;
ALTER TABLE "Interaction" ADD COLUMN "componentType" TEXT;
ALTER TABLE "Interaction" ADD COLUMN "values" JSONB;

-- AlterTable: commandId becomes nullable — a component interaction has no SlashCommand.
ALTER TABLE "Interaction" ALTER COLUMN "commandId" DROP NOT NULL;
