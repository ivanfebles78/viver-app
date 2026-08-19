# Hallazgos para devcon8-platform

Defectos encontrados en `@devcon8/ui` mientras se migraba ViverApp. Ninguno se
ha parcheado en el paquete vendorizado: `src/ui/` sigue siendo una copia byte a
byte de aguas arriba. Cada entrada incluye reproducción y corrección propuesta
para poder abrirla allí.

---

## UF-1 · `Button` no funciona con `asChild`

**Componente:** `packages/ui/src/components/button.tsx`
**Severidad:** alta — la prop está declarada y documentada, pero no funciona en ningún caso
**Encontrado en:** Fase 2 (con un `<label>`), confirmado en Fase 3 (con un `<a>`)

### Defecto

`Button` acepta `asChild` y, cuando está activo, renderiza con el `Slot` de
Radix. Pero el cuerpo del componente emite **siempre** dos hijos:

```tsx
<Comp ...>
  {loading && <Loader2 ... />}
  {children}
</Comp>
```

Con `loading === false`, `Comp` recibe `[false, children]`. `Slot` usa
`React.Children.only()`, que no admite un array, así que lanza:

```
Slot failed to slot onto its children.
Expected a single React element child or `Slottable`.
```

No depende del contenido del hijo: falla también con un único elemento simple.

### Reproducción

```jsx
import { Button } from '@devcon8/ui';

render(<Button asChild><a href="/x">ir</a></Button>);
// → Error: Slot failed to slot onto its children.
```

Verificado en ViverApp con `@radix-ui/react-slot@^1.3.3` y React 19.2.

### Corrección propuesta

Radix publica `Slottable` justamente para este caso: marca cuál de varios hijos
es el que debe fusionarse con el elemento externo.

```tsx
import { Slot, Slottable } from '@radix-ui/react-slot';

<Comp ...>
  {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
  <Slottable>{children}</Slottable>
</Comp>
```

Conserva el spinner en el modo normal y deja que `asChild` funcione. La
alternativa —no renderizar el spinner cuando `asChild` está activo— también
resuelve el error, pero pierde el estado de carga en un caso legítimo.

### Rodeo en ViverApp

`src/components/ui/LinkButton.jsx` aplica `buttonVariants` sobre un `<Link>` de
React Router. Se mantendrá aunque se corrija aguas arriba, porque además es lo
semánticamente correcto: **navegar es un enlace, no un botón**. Un `<button>`
que navega no se abre en pestaña nueva, no ofrece menú contextual y se anuncia
como «botón» en vez de «enlace».

---

## UF-2 · El diálogo modal no queda centrado con Tailwind v4

**Componente:** `packages/ui/src/styles/theme.css` (keyframes) + `components/overlays.tsx`
**Severidad:** alta — todo modal aparece desplazado media pantalla
**Encontrado en:** Fase 1

### Defecto

`DialogContent` se centra con `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`
y entra con la animación `devcon8-enter`.

En Tailwind v4 las utilidades `translate-*` se compilan a la propiedad
**`translate`**, no a `transform`. La animación `devcon8-enter` anima esa misma
propiedad y se declara con `animation-fill-mode: both`, así que su valor gana
sobre la declaración y el panel se queda en `translate: 0 0`.

Medido en navegador: con la animación, el centro del diálogo cae a **480px** del
centro del viewport en una ventana de 1920px; desactivándola, a 0px.

El comentario de `theme.css` dice que se eligió `translate` «precisamente para
componer con una utilidad de centrado basada en `transform` en lugar de
sobrescribirla». Esa premisa dejó de ser cierta al pasar a Tailwind v4.

### Corrección propuesta

Que los keyframes de entrada y salida no toquen `translate` cuando el elemento
ya lo usa para centrarse. Lo más limpio es animar una propiedad distinta
(`opacity` sola para los modales centrados) y reservar el desplazamiento para
los paneles anclados a un borde, que no necesitan centrado.

### Rodeo en ViverApp

`src/styles/app.css` iguala los puntos de entrada y salida al mismo −50% del
centrado, de modo que solo anima la opacidad. El selector apunta a la
combinación de centrado, así que no alcanza a los cajones (`Sheet`).

---

## UF-3 · `RowAction` no admite acciones condicionales por fila

**Componente:** `packages/ui/src/components/data-table.tsx`
**Severidad:** media — falta una función, no es un defecto
**Encontrado en:** Fase 2

### Necesidad

`DataTable` recibe `actions: RowAction<T>[]` y las pinta todas en cada fila. No
hay forma de mostrar una acción solo para algunas filas.

En la administración de usuarios de ViverApp, «Reenviar invitación» solo tiene
sentido si la cuenta está pendiente, «Restablecer contraseña» si está activa y
«Desbloquear» si está bloqueada. Ofrecer las tres siempre propondría al
administrador acciones que no aplican.

### Corrección propuesta

```ts
export interface RowAction<T> {
  label: string;
  onSelect: (row: T) => void;
  destructive?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  /** Se muestra solo cuando devuelve true. Por defecto, siempre. */
  when?: (row: T) => boolean;
}
```

y filtrar en `RowActionMenu` antes de renderizar. Es retrocompatible.

### Rodeo en ViverApp

`src/components/ui/RowActions.jsx` compone sobre `DropdownMenu` con la misma
apariencia y comportamiento de teclado.

---

## UF-4 · El sistema no publica `Toast` ni `Pagination`, pero sí sus tokens

**Componente:** el paquete en conjunto
**Severidad:** baja — hueco de cobertura

`tokens.css` define `--toast-radius`, `--toast-shadow`, `--toast-width`,
`--toast-duration` y la especificación describe el componente de paginación,
pero ninguno de los dos se publica.

ViverApp los ha construido contra esa especificación en
`src/components/ui/ToastProvider.jsx` y `src/components/ui/Pagination.jsx`.
Ambos son candidatos a subir tal cual, con dos matices que conviene conservar:

- El toast de error tiene `duration: Infinity` y **no hay prop para cambiarlo**.
  Un error que se auto-descarta es un error que alguien no llegó a leer.
- La paginación de ViverApp es por número de página; la de `DataTable` es por
  cursor. Ambas son legítimas y deberían convivir.

---

## UF-5 · `Kpi` no admite estado semántico

**Componente:** `packages/ui/src/components/page.tsx`
**Severidad:** baja

`Kpi` acepta `delta`/`trend`, que sirven para comparar con un periodo anterior,
pero no para expresar que el valor **actual** exige atención — «2 productos por
reponer» no es una tendencia, es un estado.

ViverApp lo compone al lado en `src/components/ui/KpiRow.jsx` en lugar de
modificar el paquete. Una prop opcional `status?: Status` sería suficiente, con
la regla de que solo se muestre cuando el valor signifique algo.

---

## UF-6 · El botón de cierre de `DialogContent` no llega al objetivo táctil mínimo — CERRADO

**Componente:** `packages/ui/src/components/overlays.tsx`
**Severidad:** media — incumple la SC 2.5.8 (AA) en móvil, justo donde más importa
**Encontrado en:** Fase 5, al corregir el solape de Productos

### Defecto

El «×» de `DialogContent` mide **18-20 px de ancho** cuando el diálogo se pinta
en un viewport estrecho. La **SC 2.5.8 «Target Size (Minimum)»** de WCAG 2.2
exige 24×24 px, y no se cumple ninguna de las excepciones: no está en línea
dentro de un texto, no hay un control equivalente en otro sitio —Escape no
cuenta, porque en un móvil táctil no hay teclado— y el tamaño no viene impuesto
por el agente de usuario.

Es el control que más se pulsa de un modal, y el que menos margen de error
tiene: está en la esquina, pegado al borde de la pantalla.

### Reproducción

Medido en navegador real sobre ViverApp, con el diálogo «Gestionar productos»:

| Viewport | Ancho del «×» | Alto |
|---:|---:|---:|
| 320 px | **18 px** | 28 px |
| 375 px | **20 px** | 28 px |
| 768 px y más | ≥ 24 px | 28 px |

El alto se mantiene en 28 px en todos los casos: es el **ancho** el que se
comprime al estrecharse el diálogo.

### Causa raíz (confirmada en la Fase 8)

No es que falte un tamaño: **es que el que hay no es un suelo**.

`icon-sm` e `icon` fijan alto y ancho con `--control-height-*`, pero ese ancho
es la medida BASE del botón. Como elemento de un flex junto a contenido que
crece —la cabecera del diálogo, con el título y la descripción— el
`flex-shrink: 1` por defecto lo comprime en horizontal mientras el alto se
queda quieto. Medido: `flex-shrink: 1`, `width: 18px` a 320 px, `height: 28px`.

Por eso a 768 px y más se ve correcto: ahí sobra espacio y no llega a encogerse.

### Corrección

En `packages/ui/src/components/button.tsx`, en las dos variantes de icono:

```diff
-        'icon-sm': 'h-[var(--control-height-sm)] w-[var(--control-height-sm)] p-0',
-        icon: 'h-[var(--control-height-md)] w-[var(--control-height-md)] p-0',
+        'icon-sm': 'h-[var(--control-height-sm)] w-[var(--control-height-sm)] shrink-0 p-0',
+        icon: 'h-[var(--control-height-md)] w-[var(--control-height-md)] shrink-0 p-0',
```

Va en la VARIANTE y no en `DialogContent`: un botón de icono es cuadrado por
definición, y dejar que se comprima rompe ese contrato para todos los
consumidores, no sólo dentro de un diálogo.

Verificado aplicando el cambio y volviendo a medir el mismo diálogo: **28×28 px
a 320, 375 y 768 px**, por encima del mínimo de 24.

### Estado: CERRADO

| Paso | Referencia |
|---|---|
| PR aguas arriba | `Devcon8SL/devcon8-platform` **#4** |
| Commit | `a69b221` |
| Merge | `ff722c9` |
| CI | 8/8 en verde, incluido el trabajo de accesibilidad en navegador real |
| Sincronizado en ViverApp | Fase 9, copiando `button.tsx` del paquete |

La corrección se extendió también a `icon-lg`: mismo defecto latente, sólo que
necesita una ventana aún más estrecha para manifestarse.

Medido de nuevo en navegador real sobre el mismo diálogo, ya con el paquete
sincronizado:

| Viewport | Ancho | Alto | `flex-shrink` | SC 2.5.8 |
|---:|---:|---:|---:|:--|
| 320 px | 28 px | 28 px | 0 | cumple |
| 375 px | 28 px | 28 px | 0 | cumple |
| 768 px | 28 px | 28 px | 0 | cumple |
| 1024 px | 28 px | 28 px | 0 | cumple |
| 1440 px | 28 px | 28 px | 0 | cumple |

### Rodeo en ViverApp

**Ninguno, y a propósito.** No se parcheó `src/ui/` en local en ningún momento:
hacerlo habría creado una divergencia que la siguiente sincronización borraría
en silencio, dejando a ViverApp con un sistema de diseño que ya no es el sistema
de diseño. Se corrigió aguas arriba y se sincronizó, que es el camino que la
regla de vendorizado exige.

Desde la Fase 9 ese camino además se COMPRUEBA: `npm run check:vendor` contrasta
cada fichero vendorizado con un manifiesto de hashes versionado —detecta
ediciones locales y funciona en CI, donde el paquete no está al lado— y, cuando
el paquete sí está disponible, compara además fichero a fichero para detectar
copias desfasadas o componentes nuevos sin portar.

---

## UF-7 — el foco no vuelve al control que abrió un diálogo controlado

**Estado: corregido aguas arriba, pendiente de sincronizar** ·
Componente: `DialogContent` (`src/ui/components/overlays.tsx`) ·
Gravedad: **alta** (WCAG 2.2 AA, criterio 2.4.3 · Orden del foco)

### Qué pasa

Al cerrar cualquier diálogo de ViverApp —con Escape o con su botón de cerrar—
el foco no vuelve al control que lo abrió: cae a `<body>`. Quien navega con
teclado aparece al principio del documento y tiene que recorrer la pantalla
entera para volver a donde estaba. En el catálogo de Productos, con un botón
«Pedir más» por fila, la diferencia entre cerrar el diálogo de la fila 9 y
seguir trabajando es de una pulsación de Tab a varias decenas.

Afecta a TODOS los diálogos de la aplicación, no a uno.

### Causa

Radix cancela la restauración de foco de su propio `FocusScope` —que la hace
bien— y en su lugar enfoca la referencia de su `DialogTrigger`:

```js
onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
  event.preventDefault();
  context.triggerRef.current?.focus();
}),
```

ViverApp no usa `DialogTrigger` en ninguna pantalla: abre los diálogos con
estado propio, porque la apertura depende de qué fila, qué producto o qué
permiso. Sin disparador esa referencia es `null`, no se enfoca nada, y el
`preventDefault()` ya ha impedido que `FocusScope` haga lo correcto.

### Por qué no lo vio nada

- **axe no lo ve.** axe examina el marcado de un instante; esto es una
  transición. Las 18 superficies de la auditoría dan cero violaciones y el
  defecto está en todas.
- **Aguas arriba tampoco lo veía.** El paquete SÍ tenía una prueba de
  devolución del foco, pero pasaba por `DialogTrigger` —el camino que funciona—
  y su escaparate no tenía ningún diálogo controlado por estado. El camino roto
  no era observable.

Se encontró recorriendo la aplicación con teclado en navegador real, que es lo
único que lo enseña.

### Corrección aguas arriba

| | |
|---|---|
| Repositorio | `devcon8-platform` |
| Rama | `fix/dialog-focus-restore` |
| PR | [#5](https://github.com/Devcon8SL/devcon8-platform/pull/5) |
| Commit | `3f4cb2d` |

`DialogContent` registra qué estaba enfocado en el instante en que el diálogo se
abre y le devuelve el foco al cerrarse. Un solo camino para los dos casos:
cuando SÍ hay disparador, el elemento registrado ES ese disparador, porque
pulsarlo es lo que lo enfocó. Un `onCloseAutoFocus` del consumidor sigue
mandando.

El registro se hace en un efecto de DISPOSICIÓN dentro del portal, no en uno
pasivo. `FocusScope` mueve el foco al diálogo desde un efecto pasivo, y todos
los de disposición de un commit se ejecutan antes que todos los pasivos; uno
pasivo aquí leería `document.activeElement` cuando el foco ya se lo había
llevado el diálogo, y registraría el propio diálogo. Fue exactamente el primer
intento, y la prueba en navegador lo tumbó.

Se añadió al escaparate el caso que faltaba —un diálogo controlado por estado—
y dos pruebas de extremo a extremo sobre él, **verificadas por mutación**:
quitando el registro fallan las dos y la de disparador sigue pasando.

### Rodeo en ViverApp

**Ninguno.** `src/ui/` no se toca en local; se sincroniza desde el paquete y
`npm run check:vendor` lo comprueba. ViverApp conserva además su propia prueba
de contrato (`src/ui/focus-restore.test.jsx`) contra el componente real: si una
sincronización futura reintrodujera el defecto, falla aquí.

---

## UF-8 — un disparador que pasa a `loading` pierde el foco al cerrarse la superposición

**Estado: CERRADO** — corregido aguas arriba y sincronizado ·
Componente: `Button` (`src/ui/components/button.tsx`) ·
Gravedad: **baja** (transitorio, no bloquea ninguna tarea)

### Qué pasa

`Button` con `loading` se renderiza `disabled`. Cuando ese botón es el que abrió
un `Dialog` o un `DropdownMenu`, y la acción de cierre arranca un proceso que lo
pone en `loading`, la devolución del foco que trae UF-7 no puede completarse: un
elemento deshabilitado no admite foco, así que éste cae a `<body>`.

En ViverApp se manifiesta al exportar un informe desde el menú «Exportar»:
el menú se cierra, la exportación empieza, el botón se deshabilita mientras
tanto y el foco se pierde.

### Comprobado, no supuesto

Verificado en navegador real y reproducido de forma determinista con la
primitiva del sistema: `disabled === true`, `document.activeElement === body`.

### Por qué no se corrigió sólo aquí

El arreglo evidente —cambiar `disabled` por `aria-disabled`— habría dejado vivas
todas las vías de activación: puntero, Enter, Espacio y el envío implícito de un
formulario. Es decir, habría cambiado un defecto de accesibilidad por uno de
duplicación, y habría trasladado la guarda a cada consumidor, que es el sitio
donde es más fácil olvidarla.

Y corregirlo sólo en ViverApp habría sido peor todavía: un botón que se comporta
distinto a los otros veinte de la aplicación, y una divergencia local en
`src/ui/` que la siguiente sincronización borraría en silencio.

### Cómo se corrigió

| | |
|---|---|
| Repositorio | `devcon8-platform` |
| Rama | `fix/button-loading-focus-restoration` |
| PR | [#7](https://github.com/Devcon8SL/devcon8-platform/pull/7) |
| Merge | `6b8adc9` |
| Incidencia | [#6](https://github.com/Devcon8SL/devcon8-platform/issues/6), cerrada |
| CI | 8/8 en verde |

`disabled` se queda **exactamente como estaba**: un control que no está a tu
alcance no gana nada estando en el orden de tabulación.

`loading` pasa a `aria-disabled` + `aria-busy`, enfocable, con el guardarraíl de
activación DENTRO del componente —`click`, `keydown`, `pointerdown` y
`mousedown`—, de modo que ningún consumidor puede quedarse sin protegerlo.

Verificado por mutación aguas arriba, una guarda cada vez: quitar el `disabled`
nativo rompe 10 pruebas; la de `click`, 7; la de `keydown`, 4; la de
`pointerdown`, 4. Ninguna sobra.

### Comprobado en ViverApp

`src/ui/boton-ocupado.test.jsx` fija el contrato contra el componente real, y se
comprobó que es rojo contra el componente anterior a la sincronización.

En navegador real, sobre «Generar informe» de Informes con la red retrasada para
que el estado sea observable: mientras trabaja el botón declara
`aria-busy="true"` y `aria-disabled="true"`, **no** está deshabilitado de forma
nativa, y **conserva el foco**.

### Una observación que NO es este defecto

El botón «Exportar» de Informes sigue perdiendo el foco al exportar un PDF, pero
por otro motivo: `savePdfWithDialog` abre el diálogo de guardado del sistema
operativo mediante `showSaveFilePicker`, y es ESE diálogo el que se lleva el
foco. Es comportamiento del navegador ante una ventana nativa, no del sistema de
diseño; durante esa exportación el botón nunca llega a marcarse como ocupado.
