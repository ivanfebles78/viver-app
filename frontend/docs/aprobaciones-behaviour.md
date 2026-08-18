# Aprobaciones — comportamiento antes de la migración

Inventario levantado sobre `Aprobaciones.jsx@ab7c739`, **antes** de tocar la
presentación. Es la pantalla donde un responsable decide qué material sale del
vivero: una decisión equivocada aquí no se deshace desde la interfaz.

## 1. Vocabulario de estados

Dos niveles distintos, y conviene no confundirlos:

| Nivel | Campo | Valores |
|---|---|---|
| Pedido | `estado` | `RESERVA`, `APROBADO_PARCIAL`, `APROBADO`, `DENEGADO`, `SERVIDO`, `CANCELADO`, `CADUCADO` |
| Línea | `estado_item` | `RESERVA`, `APROBADO`, `DENEGADO` |

Ambos por defecto valen `RESERVA` cuando faltan. `SERVIDO` ya está en el
contrato de estados de la Fase 5 (`src/app/estado.js`) como final CORRECTO.

## 2. Quién puede decidir

`canApprove = rolEfectivo(me) ∈ {admin, manager}`.

`rolEfectivo` mapea `superadmin` y `admin_vivero` a `admin`. Cualquier otro rol
—técnico, gestor de vivero, empresa externa, proveedor— **ve** la pantalla pero
no obtiene ningún control de decisión.

## 3. Las dos vías de decisión

### 3.1 Atajo de fila (aprobar/denegar el pedido entero)

Aparece solo si:

```
canApprove  Y  estado === "RESERVA"  Y  el pedido tiene EXACTAMENTE UNA línea
```

La condición de una sola línea **no es cosmética**: con varias líneas, el atajo
obligaría a «aprobar todo» o «denegar todo» y dejaría inaccesible la aprobación
parcial. Es la salvaguarda que mantiene vivo el flujo parcial.

Llama a `aprobarPedido(id, {})` o `denegarPedido(id, {})` y recarga la lista.

> **DEFECTO DETECTADO:** estos dos botones disparan la decisión **de inmediato,
> sin confirmación de ningún tipo**. Aprobar o denegar un pedido es
> irreversible desde la interfaz. Es el hallazgo principal de la fase.

### 3.2 Modal de detalle (aprobación parcial, línea a línea)

El único camino para decidir un pedido de varias líneas.

- Cada línea en `RESERVA` recibe una decisión local: `"aprobar"` o `"denegar"`.
- Las decisiones viven **solo en el estado del modal**. Nada llega al backend
  hasta pulsar «Confirmar decisiones». Cerrar el modal las descarta.
- No se puede confirmar hasta decidir **todas** las líneas en reserva:
  `allDecided = pendingCount > 0 && decidedLocalCount === pendingCount`.
- El campo «Motivo de denegación» solo aparece si hay alguna denegada.

## 4. Aritmética de la aprobación

**No existe ninguna edición de cantidades en toda la pantalla.** El único campo
de texto del modal es el motivo de denegación. La decisión por línea es
binaria: la línea entera se aprueba o se deniega.

Consecuencias que la migración NO puede alterar:

- La cantidad aprobada de una línea aprobada **es** su cantidad solicitada.
- Una línea denegada no aporta cantidad.
- El frontend **nunca** transmite cantidades al decidir: el `PUT` no las lleva.
- El estado resultante del pedido (`APROBADO` / `APROBADO_PARCIAL` /
  `DENEGADO`) lo calcula el **backend**, no esta pantalla.

## 5. Payload de decisión

```
POST /pedidos/{id}/decidir
{
  approved_item_ids: number[],   // ids de línea con decisión "aprobar"
  denied_item_ids:   number[],   // ids de línea con decisión "denegar"
  motivo_denegacion: string|null // null si no hay ninguna denegada
}
```

Detalles que son contrato, no estilo:

- Solo se recorren las líneas en `RESERVA`. Las ya decididas no se reenvían.
- `motivo_denegacion` es `null` cuando no hay denegadas, **y también** cuando
  hay denegadas pero el motivo está vacío o en blanco (`motivo.trim() || null`).
- Los ids conservan el orden de aparición de las líneas.

## 6. Filtros

Cinco filtros combinables con **Y** lógico, sobre la lista ordenada por
`created_at` descendente:

| Filtro | Regla |
|---|---|
| Id | `String(p.id).includes(idFiltro.trim())` — subcadena, no igualdad |
| Estado | `TODOS`; `PENDIENTES` = {`RESERVA`, `APROBADO_PARCIAL`}; o igualdad exacta |
| Fecha | `dateInputValue(created_at) === fechaFiltro` (día exacto, hora ignorada) |
| Solicitante | subcadena, sin distinguir mayúsculas, sobre el nombre **formateado** |
| Texto libre | id, solicitante, estado, o el detalle `producto_id tamaño cantidad` |

El solicitante se resuelve por el primer campo no vacío de:
`solicitante_username`, `solicitante`, `created_by`, `usuario`, `username`; si
todos faltan, `"—"`.

## 7. Disponibilidad del PDF

```
canShowPdf = estado ∈ {APROBADO, APROBADO_PARCIAL, SERVIDO, DENEGADO}
             O alguna línea está en {APROBADO, SERVIDO}
```

Un pedido totalmente denegado **sí** tiene PDF: conserva valor de auditoría
(detalle de líneas y motivo). Solo se oculta en un `RESERVA` sin ninguna
decisión registrada.

## 8. Agrupación por destino

Las líneas se agrupan por `distrito · barrio · dirección` **en orden de
aparición**, conservando la decisión por línea. `variosDestinos` es cierto
cuando el pedido no es de reposición y hay más de un destino distinto. Los
pedidos de reposición tienen destino fijo «Vivero».

## 9. Mensajería

`showTimedMessage` borra el aviso a los **3 s** y cancela el temporizador
anterior. Los avisos de correo que devuelve el backend (`email_warnings`) se
concatenan al mensaje: `«… Aviso: a · b»`.

## 10. Estado de la interfaz antes de migrar

- El modal de detalle es un `div` con `position: fixed` hecho a mano: **sin**
  trampa de foco, **sin** cierre con Escape y **sin** devolución del foco.
- No hay ningún diálogo nativo (`window.confirm`/`alert`) — pero tampoco hay
  confirmación alguna para las acciones irreversibles de fila.
- Deuda visual: 291 (hex 94, rgb 77, peso 35, radio 8, estilo en línea 75,
  degradado 2). Es la pantalla con más deuda del repositorio.
