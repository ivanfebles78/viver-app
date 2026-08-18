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

## UF-6 · El botón de cierre de `DialogContent` no llega al objetivo táctil mínimo

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

### Estado

Preparada aguas arriba en `devcon8-platform`, rama `fix/icon-button-shrink`,
commit `ed740c3`. Sin publicar: queda a decisión de quien mantiene el paquete.

### Rodeo en ViverApp

**Ninguno, y a propósito.** `src/ui/` sigue siendo copia byte a byte del
paquete: parchearlo sólo aquí crearía una divergencia que la próxima
sincronización borraría en silencio, y dejaría a ViverApp con un sistema de
diseño que ya no es el sistema de diseño. El defecto sigue presente en ViverApp
hasta que se sincronice la corrección de aguas arriba.
