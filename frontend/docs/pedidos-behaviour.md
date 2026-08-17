# Pedidos — comportamiento existente

Levantado de `src/pages/Pedidos.jsx@1767485` (3 160 líneas) **antes** de migrar.
Es el contrato que la Fase 5 debe conservar: si algo de aquí deja de ser cierto
después, es una regresión.

---

## 1. Qué es esta pantalla

Gestiona los pedidos del vivero: los que la UTE y las entidades externas hacen
al vivero (`tipo: "salida"`) y los de reposición que el vivero hace a sus
proveedores (`tipo: "reposicion"`). Es la pantalla con más lógica de rol de
toda la aplicación.

## 2. Estados de pedido — siete

`RESERVA`, `APROBADO_PARCIAL`, `APROBADO`, `SERVIDO`, `DENEGADO`, `CANCELADO`,
`CADUCADO`.

`estadoNormalizado()` los recorta y pasa a mayúsculas. La etiqueta visible de
`APROBADO_PARCIAL` es `APROBADO PARCIAL` (con espacio, sin guion bajo).

Las líneas tienen su propio estado (`estado_item`): `APROBADO`, `RESERVA`,
`DENEGADO`, y su cantidad servida (`cantidad_servida`).

## 3. Roles y permisos — la parte crítica

| Rol | Ve | Puede editar/cancelar | Puede crear |
|---|---|---|---|
| `admin` (incl. superadmin y admin_vivero) | todos | solo en `RESERVA` | sí |
| `manager` | todos | según `puedeEditarCancelar` | sí |
| `empresa_externa` | **solo los suyos**, y **nunca** los de reposición | solo los suyos en `RESERVA` | sí |
| `tecnico` | todos | no (solo lectura) | no |
| `gestor_vivero` | todos | no (solo lectura) | no |
| `proveedor` | todos | no (estrictamente lectura) | no |

### `puedeEditarCancelar(p)` — reglas, en este orden

1. Si el estado es `APROBADO`, `DENEGADO`, `SERVIDO`, `CANCELADO` o `CADUCADO`
   → **false**. Un pedido decidido no se toca.
2. Si el rol es de solo lectura (`tecnico`, `gestor_vivero`, `proveedor`)
   → **false**.
3. Si es `admin` → **true solo si el estado es `RESERVA`**.
4. Si no: **true solo si** el rol es `empresa_externa`, el estado es `RESERVA`
   **y** el solicitante es el propio usuario.

### Defensa en frontend para `empresa_externa`

El filtro oculta los pedidos de reposición y los que no son suyos. La
comparación usa el username **crudo** en minúsculas, no el formateado: el
backend guarda `medina` y `formatUsername` devolvería `Medina`, lo que dejaba la
lista vacía. Es un defecto ya corregido; no debe volver.

## 4. Carga de datos

`refrescar()` distingue por rol:

- **`proveedor`**: solo `getPedidos()`. No tiene permiso sobre `/productos` ni
  `/movimientos` (devolverían 403).
- **resto**: `Promise.allSettled` de los tres. Un 403 aislado en productos o
  movimientos **no** vacía la lista de pedidos. Solo se avisa al usuario si lo
  que falla es `/pedidos`.

## 5. Filtros — cinco, todos en memoria

| Filtro | Criterio |
|---|---|
| Estado | `TODOS` o igualdad exacta con el estado normalizado |
| ID | `includes` sobre el id |
| Fecha | `dateInputValue(created_at) === filtro` (día natural local) |
| Solicitante | igualdad exacta contra la lista de solicitantes presentes |
| Texto | `includes` sobre id, solicitante, estado, **detalle de líneas** y destino |

El orden es siempre por `created_at` descendente, **antes** de aplicar los
filtros de la segunda pasada.

## 6. Tabla — nueve columnas

ID · Tipo · Pedido · Caduca · Solicitante · Destino · Detalle · Estado ·
Acciones.

La columna «Detalle» tiene `minWidth: 320` y despliega las líneas del pedido.
Las filas se pueden expandir (`expandedRows`).

## 7. Acciones

| Acción | Quién | Efecto |
|---|---|---|
| Nuevo pedido | no lectura | Abre `PedidoModal`; `createPedido`; recarga |
| Editar | `puedeEditarCancelar` | Edición en línea de cantidades; `updatePedido` |
| Cancelar | `puedeEditarCancelar` | `cancelarPedido`; recarga |
| Imprimir | todos | `ImprimirPedidosModal` → PDF o impresión en navegador |
| Expandir fila | todos | Muestra el detalle de líneas |

### Edición

`startEdit` construye un mapa `clave → cantidad` con `lineKey(productoId,
tamano)`. Al guardar se filtran las líneas con `cantidad > 0`, `producto_id`
finito y `tamano` presente. Es decir: **poner una cantidad a 0 elimina la
línea**.

### Avisos de correo

`createPedido` puede devolver `email_warnings`; se muestran al usuario. El
pedido se crea igualmente.

## 8. Mensajes

`showTimedMessage(texto, tipo)` muestra un banner y lo borra **a los 3 000 ms**.

## 9. Exportación e impresión — a proteger como en la Fase 4B

`ImprimirPedidosModal` permite elegir pedidos y:

- **`guardarPedidosPdf`** → `buildPedidosPdf` → un `renderPedidoEnPdf` por
  pedido, con `addFootersToAllPages`.
- **`imprimirPedidosEnNavegador`** → abre el PDF para imprimir.

`renderPedidoEnPdf` dibuja: cabecera con logotipo, datos del pedido, destino, y
la tabla de líneas. El nombre de fichero pasa por `sanitizeFileName`.

**Este es el mismo riesgo que Informes**: la maquetación del PDF comparte
criterios de formato con la pantalla. Se protege con un contrato antes de
migrar.

## 10. Diálogos nativos

**Ninguno.** Pedidos no usa `window.confirm` ni `alert`. La cancelación se
ejecuta **sin confirmación** — comportamiento actual, y un hallazgo a evaluar.

## 11. Comportamiento responsivo actual

La tabla va dentro de `overflow-x: auto` con una columna de `minWidth: 320`.
Los filtros usan una rejilla fija. Por debajo de ~1 100 px hay desplazamiento
horizontal.

## 12. Deuda visual

hex 148 · rgb 155 · peso tipográfico 77 · radio 19 · estilo en línea 169 ·
degradado 15. Total **583**, el 29 % de la deuda del repositorio.
