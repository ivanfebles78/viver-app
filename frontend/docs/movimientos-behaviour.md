# Movimientos — comportamiento existente

Levantado de `src/pages/Movimientos.jsx@693d45c` (3 613 líneas) **antes** de
migrar. Es el contrato que la Fase 4A debe conservar: si algo de este documento
deja de ser cierto después de la migración, es una regresión, no una mejora.

---

## 1. Qué es esta pantalla

Registra y consulta los movimientos físicos del vivero: entradas, salidas,
préstamos, devoluciones y traslados internos. Es la pantalla de uso diario del
personal del vivero.

## 2. Permisos

**La pantalla no contiene ninguna comprobación de rol.** El acceso lo decide
exclusivamente el guard de ruta (`canAccessRoute` en `app/permissions.js`), que
la Fase 4A **no toca**. Por construcción, los permisos no cambian.

## 3. Carga de datos

`load()` hace `Promise.all` de `getMovimientos()`, `getProductos()` y
`getPedidos()`. **No es `allSettled`**: si una falla, no hay datos y se muestra
un mensaje de error. Se conserva tal cual — cambiarlo a `allSettled` sería un
cambio de comportamiento.

Las zonas se cargan aparte con `loadZonasFromServer()`, en un efecto propio y
tolerante a fallos: si falla, se mantiene `DEFAULT_ZONAS`. Los identificadores
se normalizan (`"zona-3a"`, `"zona3a"`, `"ZONA-3A"`, `"3a"` → `"3a"`), se
deduplican y se ordena de forma natural. `ensureZonasEspeciales` garantiza que
los tres almacenes y la zona de compostaje estén siempre presentes.

## 4. Acciones del usuario

| Acción | Disparador | Efecto |
|---|---|---|
| Nuevo movimiento | Botón primario | Abre `MovimientoCestaModal` (cesta multiproducto) |
| Servir pedido / Devolución | Botón secundario | Abre `MovimientoModal` (asistente por pasos) |
| Ver detalles | Botón por fila | Abre `MovimientoDetalleModal` |
| Copiar UUID | Botón por fila **y** clic en el propio UUID | `navigator.clipboard.writeText`, marca «Copiado» 1 800 ms |
| Filtrar | 7 controles | Filtra la tabla en memoria |
| Limpiar filtros | Botón | Pone los 7 filtros a `""` |

### Mensajes

`showTimedMessage(texto, tipo)` muestra un banner y lo borra **a los 3 000 ms**.
El temporizador se cancela al desmontar y al mostrar un mensaje nuevo.

### Alta de movimientos

`handleCreateMovimiento` acepta un payload o una lista. Recorre la lista en
serie y **se detiene en el primer fallo**; luego recarga y avisa
`Guardados N/M`. Si no hay fallos, cierra los modales, recarga y avisa. Este
comportamiento «parar en el primer error» es deliberado y se conserva.

## 5. Filtros — 7, todos en memoria

| Filtro | Control | Criterio |
|---|---|---|
| Producto | texto | `includes` sobre `nombre_cientifico + nombre_natural + producto_id`, minúsculas, recortado |
| Tipo | select | igualdad exacta con `tipo_movimiento` o, si falta, `getMovimientoTipo(m)` |
| Zona | select | la zona aparece en `zona_origen` **o** `zona_destino` |
| UUID | texto | `includes` sobre `uuid_lote` |
| Origen | select | igualdad exacta con `origen_tipo` |
| Destino | select | igualdad exacta con `destino_tipo` |
| Fecha | date | `dateInputValue(fecha_movimiento) === filtro` (día natural local) |

Se combinan con **Y** lógico. Un filtro vacío no restringe.

## 6. Tabla — 11 columnas, en este orden

1. Fecha · 2. Tipo · 3. Nombre científico · 4. Cant. · 5. Origen · 6. Destino ·
7. Préstamo · 8. Usuario · 9. UUID lote · 10. Pedido · 11. Detalles

Reglas de contenido:

- **Fecha**: `formatFechaCanaria`.
- **Tipo**: `getTipoDisplayLabel(tipo_movimiento || getMovimientoTipo(m))`.
- **Cant.**: `formatCantidadConUnidad(cantidad, getUnidadMovimiento(m))`.
- **Origen**: `buildLabelOrigen` — `Vivero · <zona> · <tamaño>` o el tipo a secas.
- **Destino**: `buildLabelDestino` — igual, y para destinos externos añade
  distrito, barrio y dirección separados por ` · `.
- **Préstamo**: `Préstamo` si `es_prestamo`; `Devolución` si `es_devolucion` o
  el tipo derivado es `devolucion`; si no, `—`.
- **Usuario**: `formatUsername(created_by)` o `—`.

## 7. Derivación del tipo — `getMovimientoTipo`

Reglas, **en este orden** (el orden importa):

1. origen `vivero` y destino `vivero` → `traslado_interno`
2. destino `vivero` y origen en {empresa, organismo oficial, colegio, otro,
   otros} → `devolucion`
3. destino `vivero` → `entrada`
4. resto → `salida`

Comparación en minúsculas y recortada.

## 8. Validación del formulario — `getFormErrors`

Devuelve una lista de textos. Reglas:

- Producto obligatorio.
- Cantidad > 0, **salvo** si `formatoConfig.showCantidad === false`
  (fitosanitarios y fertilizantes).
- Origen y destino obligatorios.
- `observaciones` obligatorio si `formatoConfig.observacionesRequired`.
- Mismo origen y destino prohibido salvo que ambos sean `Vivero`.
- {Empresa Externa, Otro, Palmetum, Empresa, Organismo oficial, Colegio} solo
  pueden mover **hacia** Vivero.
- Origen `Vivero` exige zona y tamaño de origen.
- Destino `Vivero` exige zona y tamaño de destino.
- Destino externo exige distrito, barrio y dirección.
- Traslado interno debe cambiar de zona **o** de tamaño.
- `fecha_disponibilidad` solo vale con destino `Vivero` y tamaño `M35`, y debe
  ser **estrictamente futura**.

## 9. Stock — `buildStockByProductZoneSize`

Recorre los movimientos y acumula por clave
`productoId__zona(minúsculas)__tamaño`:

- destino `vivero` con zona y tamaño → **suma** la cantidad
- origen `vivero` con zona y tamaño → **resta** la cantidad

Ignora movimientos sin `producto_id` o con cantidad 0.

`normalizeTamanoForStock` mapea `semillero→Semillero`, `m12→M12`, `m20→M20` y
—ojo— **`m30→M35`**. Es una corrección de datos heredados; se conserva.

## 10. Modales

| Modal | Líneas | Qué hace |
|---|---|---|
| `MovimientoCestaModal` | 591 | Cesta multiproducto: se añaden varias líneas y se registran juntas |
| `MovimientoModal` | 1 366 | Asistente por pasos para servir un pedido o registrar una devolución; incluye reparto por zonas y `PedidoSelectorModal` |
| `MovimientoDetalleModal` | 124 | Solo lectura |

`pedidosAprobados` filtra los pedidos con estado `APROBADO` o
`APROBADO_PARCIAL` — los parcialmente aprobados **sí** son servibles.

## 11. Comportamiento responsivo actual

Ninguno. La rejilla de filtros es `repeat(7, minmax(0,1fr)) auto` fija y la
tabla usa `table-layout: fixed` con anchos en píxeles que suman ~1 115 px. Por
debajo de ~1 200 px la pantalla se desborda horizontalmente.

## 12. Deuda visual concentrada aquí

Colores en crudo, `fontWeight: 900`, radios 10–18, sombras largas y
`borderSpacing: "0 10px"` con bordes por celda para simular filas-tarjeta. Es
uno de los focos principales de deuda del proyecto.
