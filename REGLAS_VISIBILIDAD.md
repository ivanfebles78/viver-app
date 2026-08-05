# Reglas de visibilidad de productos para la empresa externa (UTE)

Este documento resume **todas las reglas** que determinan si un producto —y en
qué tamaño— es visible y pedible para el rol `empresa_externa` (UTE) al crear un
pedido. Es una referencia; la fuente de verdad es el código citado.

> Fuentes principales:
> - Backend: `main.py` → endpoint `GET /productos`, `_tamano_disponible_planta()`, `_disponible_filter()`.
> - Frontend: `frontend/src/pages/Pedidos.jsx` → `buildStockByProductSize()`, `productosConStock`.
> - Reglas de tamaño (espejo en frontend): `frontend/src/utils/formato.js` → `tamanoDisponiblePlanta()`.

---

## 1. A nivel de producto (¿aparece en el catálogo de la UTE?)

- **Producto interno oculto.** La UTE **solo ve productos con `es_interno = false` (o sin marcar)**.
  Los marcados como internos —individualmente o vía "Marcar zona como interna"— **no se le muestran**.
  El filtro se aplica solo para el rol `empresa_externa` (`main.py`, `GET /productos`).
- **Debe tener stock disponible.** Solo aparece si tiene **disponible > 0 en algún tamaño válido**.
  Si su disponible queda a 0 por las reglas de abajo, desaparece del formulario de pedido
  (`productosConStock` en `Pedidos.jsx`).
- **Sin ocultación por categoría.** Fitosanitarios, fertilizantes, áridos, ferretería, etc.
  son visibles *salvo* que se marquen como internos. Solo `es_interno` los oculta.
- La UTE **no ve** en la respuesta: `stock_minimo`, el flag `es_interno`, ni el motivo de
  denegación de pedidos (se omiten para ese rol).

## 2. Disponible por tamaño (fórmula)

Para cada tamaño:

```
disponible(tamaño) = stock_real − reservado − stock_con_fecha_futura
```

Condiciones adicionales:
- Solo se cuentan lotes con `cantidad_disponible > 0`.
- El tamaño debe pasar la **regla de tipo de planta** (sección 3).
- El resultado nunca es negativo (se limita a 0).

## 3. Reglas de tamaño por tipo de planta

Definidas en `_tamano_disponible_planta()` (backend) y `tamanoDisponiblePlanta()` (frontend).
**Aplican SOLO a la categoría "Planta".** Productos que no son plantas (fitosanitario,
fertilizante, árido, ferretería…) **no tienen restricción de tamaño/formato**.

| Tipo (subcategoría)  | Tamaños disponibles | No disponibles          |
|----------------------|---------------------|-------------------------|
| Cualquier planta     | —                   | **Semillero: nunca**    |
| Arbusto              | M20, M35            | Semillero, M12          |
| Árbol                | M35                 | Semillero, M12, M20     |
| Palmera              | M35                 | Semillero, M12, M20     |
| Resto de plantas     | M12, M20, M35       | Semillero               |

> Nota: el tamaño "M30" se normaliza a "M35".

## 4. Fecha de disponibilidad futura

- Si un lote tiene **`fecha_disponibilidad > hoy`**, ese stock **NO cuenta como disponible
  para pedir/reservar hasta esa fecha**. Sigue contando como "stock del vivero", pero se
  resta del disponible.
- El filtro (`_disponible_filter()`) considera disponible solo lo que tiene
  `fecha_disponibilidad` **nula o ≤ hoy**.
- Caso típico: entradas M35 "en maduración" con fecha de disponibilidad futura.

## 5. Stock reservado

- Las unidades ya **comprometidas por otros pedidos de salida vivos** (en RESERVA o aprobados
  sin servir) se **restan** del disponible (`reservas_map` en `main.py`).
- No oculta el producto por sí solo, pero reduce/agota lo que la UTE puede pedir.

---

## Resumen en una frase

Un producto es **visible y pedible** para la UTE si: **no es interno**, **tiene stock real**
en un **tamaño permitido para su tipo de planta** (semillero nunca; árboles/palmeras solo M35;
arbustos M20/M35; resto M12/M20/M35), **descontando lo reservado** y **el stock con fecha de
disponibilidad aún futura**.
