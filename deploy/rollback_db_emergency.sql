-- ============================================================
-- Emergency rollback — drop `pedido_items.estado_item`
-- ============================================================
-- Use this ONLY if Alembic's `alembic downgrade -1` fails.  This
-- replicates the migration's downgrade() in raw SQL, with
-- IF-EXISTS guards so it can be re-run without erroring.
--
-- After running this, you MUST also reset the Alembic version row
-- so future `alembic upgrade head` calls don't try to re-drop the
-- column.  The last statement at the bottom does that.
-- ============================================================

BEGIN;

-- 1) Drop the index if it exists.
DROP INDEX IF EXISTS ix_pedido_items_estado_item;

-- 2) Drop the column if it exists.
ALTER TABLE pedido_items DROP COLUMN IF EXISTS estado_item;

-- 3) Point Alembic at the previous migration so future upgrades
--    see this rollback as authoritative.
UPDATE alembic_version
SET    version_num = '671644fc3faf'
WHERE  version_num = 'b8c4f9a2e106';

COMMIT;

-- Verification — should return zero rows for both:
SELECT column_name
FROM   information_schema.columns
WHERE  table_name  = 'pedido_items'
AND    column_name = 'estado_item';

SELECT indexname
FROM   pg_indexes
WHERE  tablename  = 'pedido_items'
AND    indexname  = 'ix_pedido_items_estado_item';
