-- =========================================================================
-- Split de la zona "Almacén" en tres almacenes especializados:
--   - Almacén Fitosanitarios   (api_id: almacen-fito)
--   - Almacén General          (api_id: almacen-general)
--   - Almacén Fertilizantes    (api_id: almacen-fert)
--
-- Ejecutar en Railway → PostgreSQL → Query antes de desplegar el cambio en
-- el frontend. Idempotente (puede ejecutarse varias veces sin romper nada).
-- =========================================================================

BEGIN;

-- 1) Crear las 3 nuevas zonas con polígonos placeholder en la esquina
--    superior derecha. Se reajustarán con el editor del mapa más tarde.
INSERT INTO zona_polygons (id, api_id, nombre, color, puntos, sort_order, updated_at, updated_by)
VALUES
  ('zona-almacen-fito',    'almacen-fito',    'Almacén Fitosanitarios', '#F08080', '1750,150 1950,150 1950,300 1750,300', 100, NOW(), 'sql-migration'),
  ('zona-almacen-general', 'almacen-general', 'Almacén General',        '#A0A0F0', '1750,310 1950,310 1950,460 1750,460', 101, NOW(), 'sql-migration'),
  ('zona-almacen-fert',    'almacen-fert',    'Almacén Fertilizantes',  '#80F080', '1750,470 1950,470 1950,620 1750,620', 102, NOW(), 'sql-migration')
ON CONFLICT (id) DO NOTHING;

-- 2) Migrar los movimientos existentes que usaban "almacen"/"Almacén"
--    al almacén específico de la categoría del producto.

-- 2a) zona_origen: fitosanitario / fitosanitarios → almacen-fito
UPDATE movimientos m
SET zona_origen = 'almacen-fito'
FROM productos p
WHERE m.producto_id = p.id
  AND LOWER(p.categoria) IN ('fitosanitario', 'fitosanitarios')
  AND LOWER(REGEXP_REPLACE(COALESCE(m.zona_origen, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

-- 2b) zona_origen: fertilizante / fertilizantes → almacen-fert
UPDATE movimientos m
SET zona_origen = 'almacen-fert'
FROM productos p
WHERE m.producto_id = p.id
  AND LOWER(p.categoria) IN ('fertilizante', 'fertilizantes')
  AND LOWER(REGEXP_REPLACE(COALESCE(m.zona_origen, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

-- 2c) zona_origen: ferreteria → almacen-general
UPDATE movimientos m
SET zona_origen = 'almacen-general'
FROM productos p
WHERE m.producto_id = p.id
  AND LOWER(p.categoria) = 'ferreteria'
  AND LOWER(REGEXP_REPLACE(COALESCE(m.zona_origen, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

-- 2d) zona_destino: mismos tres updates
UPDATE movimientos m
SET zona_destino = 'almacen-fito'
FROM productos p
WHERE m.producto_id = p.id
  AND LOWER(p.categoria) IN ('fitosanitario', 'fitosanitarios')
  AND LOWER(REGEXP_REPLACE(COALESCE(m.zona_destino, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

UPDATE movimientos m
SET zona_destino = 'almacen-fert'
FROM productos p
WHERE m.producto_id = p.id
  AND LOWER(p.categoria) IN ('fertilizante', 'fertilizantes')
  AND LOWER(REGEXP_REPLACE(COALESCE(m.zona_destino, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

UPDATE movimientos m
SET zona_destino = 'almacen-general'
FROM productos p
WHERE m.producto_id = p.id
  AND LOWER(p.categoria) = 'ferreteria'
  AND LOWER(REGEXP_REPLACE(COALESCE(m.zona_destino, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

-- 3) Migrar inventario_lote.zona igualmente.
UPDATE inventario_lote il
SET zona = 'almacen-fito'
FROM productos p
WHERE il.producto_id = p.id
  AND LOWER(p.categoria) IN ('fitosanitario', 'fitosanitarios')
  AND LOWER(REGEXP_REPLACE(COALESCE(il.zona, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

UPDATE inventario_lote il
SET zona = 'almacen-fert'
FROM productos p
WHERE il.producto_id = p.id
  AND LOWER(p.categoria) IN ('fertilizante', 'fertilizantes')
  AND LOWER(REGEXP_REPLACE(COALESCE(il.zona, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

UPDATE inventario_lote il
SET zona = 'almacen-general'
FROM productos p
WHERE il.producto_id = p.id
  AND LOWER(p.categoria) = 'ferreteria'
  AND LOWER(REGEXP_REPLACE(COALESCE(il.zona, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén');

-- 4) Borrar la zona "almacen" antigua del mapa (cualquier variante).
DELETE FROM zona_polygons
WHERE LOWER(REGEXP_REPLACE(COALESCE(api_id, ''), '[ _-]', '', 'g')) IN ('almacen', 'almacén')
   OR LOWER(REGEXP_REPLACE(COALESCE(id, ''), '[ _-]', '', 'g')) IN ('almacen', 'zonaalmacen', 'almacén', 'zonaalmacén');

COMMIT;

-- Verificación rápida (opcional, no afecta).
SELECT id, api_id, nombre, sort_order FROM zona_polygons ORDER BY sort_order;
