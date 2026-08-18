# Plataforma — comportamiento antes de la migración

Inventario sobre `Plataforma.jsx@607552d`, **antes** de tocar la presentación.
Es el panel del dueño de la plataforma: da de alta ayuntamientos, fija lo que
paga cada uno y puede volcar una copia de seguridad sobre sus datos.

## 1. Quién la ve

La ruta ya está restringida por `permissions.js` al `superadmin`. La pantalla
**no** vuelve a comprobar el rol: confía en el enrutador. No se cambia.

## 2. Los cinco diálogos nativos

Es lo que hace de esta pantalla la última con deuda de diálogos:

| # | Sitio | Tipo | Qué decide |
|---|---|---|---|
| 1 | `importarDatos` | `window.confirm` | **Autoriza sobrescribir datos de un ayuntamiento** |
| 2 | `importarDatos` (éxito) | `alert` | Informe de lo importado, línea por línea |
| 3 | `importarDatos` (fallo) | `alert` | Error del backend |
| 4 | `guardarCuota` (validación) | `alert` | Cuota no válida |
| 5 | `guardarCuota` (fallo) | `alert` | Error del backend |

Los cuatro `alert` se llaman en su **forma suelta** (`alert(...)`, sin
`window.`), que es justo por lo que el guardarraíl detecta las dos formas.

### 2.1 Flujo de control de la importación — lo delicado

```js
onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; importarDatos(c.id, f); }}
```

Tres detalles que **la migración no puede romper**:

1. El fichero se **captura antes** de vaciar el input. Si se leyera después del
   `await`, ya no estaría.
2. El input se vacía **siempre**, se confirme o no. Sin eso, volver a elegir el
   mismo fichero no dispara `onChange` y el botón parece muerto.
3. `window.confirm` **bloquea**; `useConfirm` devuelve una promesa. Hay que
   **esperarla** antes de llamar a `importClienteData`, o la importación se
   ejecutaría antes de que el usuario decida — que es exactamente el fallo de
   inversión de control que ya se corrigió en Productos y Aprobaciones.

## 3. Reglas de negocio

### 3.1 Cuota

```
raw = String(value ?? "").trim().replace(",", ".")
num = raw === "" ? null : Number(raw)
si num !== null y (NaN o < 0) → rechazar, NO llamar al backend
payload = { set_cuota: true, cuota_mensual: num }
```

- **Vacío significa «cuota por defecto de la plataforma»**, y viaja como `null`.
  No es lo mismo que `0`, que significa «gratis».
- Se acepta la **coma decimal** española: `19,90` → `19.90`.
- Un valor inválido **no** cierra el editor: el usuario conserva lo que escribió.

### 3.2 Alta de ayuntamiento (enrollment)

El slug se autocompleta desde el nombre: minúsculas, sin tildes, todo lo que no
sea `a-z0-9` a guiones, sin guiones sueltos en los extremos.

**Deja de autocompletarse en cuanto el usuario lo toca.** Se detecta comparando
el slug actual con el último autogenerado (`_autoSlug`); si difieren, manda el
del usuario. `_autoSlug` es estado interno y **no** viaja en el payload.

Payload: los campos vacíos opcionales viajan como `null`, no como `""`.

### 3.3 Entrar en un ayuntamiento

`setActiveClienteId(cid)` y recarga entera a `/dashboard`. La recarga es
deliberada: fija la cabecera `X-Cliente-Id` para todas las peticiones
siguientes.

## 4. Gráfica de evolución

SVG dibujado a mano, 640×220 con 34 de margen. Línea acumulada de altas por
mes, con área degradada bajo la curva. Con `maxY = max(1, …)` para no dividir
entre cero cuando no hay altas. Sin datos, muestra un texto.

## 5. Estado de la interfaz antes de migrar

- Todo el estilo es en línea, con hexadecimales a mano.
- La tarjeta de facturación usa un **degradado** verde.
- La tabla no tiene `scope` ni `caption`.
- El editor de cuota usa botones con «✓» y «✕» **sin nombre accesible**.
- El input de fichero está oculto dentro de un `<label>` sin `htmlFor`, así que
  no es alcanzable por teclado de forma fiable.
- Deuda visual: 135.
