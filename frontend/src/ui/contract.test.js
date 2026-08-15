/**
 * CONTRATO ENTRE EL CÓDIGO DE LA APLICACIÓN Y EL PAQUETE VENDORIZADO.
 *
 * `src/ui/` está en TypeScript y se comprueba con `npm run typecheck`.
 * `src/**` de la aplicación está en .jsx y NO se comprueba — así que un prop
 * inválido pasado a un componente de DevCon8 no lo detecta nadie.
 *
 * Ya ocurrió: `<DialogContent size="xl">` en ZonaMapDialog. `size` solo acepta
 * sm|md|lg, así que la búsqueda del ancho devolvió `undefined`, el diálogo se
 * quedó sin `max-width` y ocupó 1.888px de un viewport de 1.920. El build no
 * falla, el typecheck no lo ve y la prueba unitaria tampoco: solo se nota
 * mirándolo.
 *
 * Esta prueba lee las uniones declaradas en los .tsx y las contrasta con lo
 * que la aplicación pasa realmente. No sustituye a TypeScript; cierra el hueco
 * concreto por el que se colaría el mismo error otra vez.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");

function sourceFiles(dir, exts, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, exts, acc);
      continue;
    }
    if (exts.some((e) => entry.endsWith(e))) {
      acc.push({ path: relative(SRC, full).replace(/\\/g, "/"), source: readFileSync(full, "utf8") });
    }
  }
  return acc;
}

/** Extrae la unión de literales de `size` declarada en un componente .tsx. */
function declaredSizes(source, componentInterface) {
  const block = source.split(`interface ${componentInterface}`)[1];
  if (!block) return null;
  const match = block.slice(0, 600).match(/size\?:\s*([^;]+);/);
  if (!match) return null;
  return match[1].match(/'([^']+)'/g)?.map((s) => s.replace(/'/g, "")) ?? null;
}

const overlays = readFileSync(join(SRC, "ui/components/overlays.tsx"), "utf8");
const button = readFileSync(join(SRC, "ui/components/button.tsx"), "utf8");

/** Ficheros de la aplicación (todo menos el paquete vendorizado y las pruebas). */
const appFiles = sourceFiles(SRC, [".jsx", ".js"]).filter(
  (f) => !f.path.startsWith("ui/") && !/\.(test|spec)\./.test(f.path)
);

describe("props `size` pasados a componentes de DevCon8", () => {
  it("DialogContent declara sm|md|lg", () => {
    expect(declaredSizes(overlays, "DialogContentProps")).toEqual(["sm", "md", "lg"]);
  });

  it("ningún DialogContent de la aplicación usa un size fuera de la unión", () => {
    const permitidos = new Set(declaredSizes(overlays, "DialogContentProps"));
    const infracciones = [];

    for (const { path, source } of appFiles) {
      // Cada apertura de <DialogContent …> hasta su `>`.
      for (const m of source.matchAll(/<DialogContent\b([\s\S]*?)>/g)) {
        const size = m[1].match(/\bsize=["']([^"']+)["']/);
        if (size && !permitidos.has(size[1])) {
          infracciones.push(`${path}: size="${size[1]}" (permitidos: ${[...permitidos].join("|")})`);
        }
      }
    }
    expect(infracciones).toEqual([]);
  });

  it("ningún SheetContent de la aplicación usa un `side` inválido", () => {
    const infracciones = [];
    for (const { path, source } of appFiles) {
      for (const m of source.matchAll(/<SheetContent\b([\s\S]*?)>/g)) {
        const side = m[1].match(/\bside=["']([^"']+)["']/);
        if (side && !["left", "right"].includes(side[1])) {
          infracciones.push(`${path}: side="${side[1]}"`);
        }
      }
    }
    expect(infracciones).toEqual([]);
  });

  it("ningún Button de la aplicación usa una variante o tamaño inválidos", () => {
    const variantes = new Set(["primary", "secondary", "outline", "ghost", "destructive"]);
    const tamanos = new Set(["sm", "md", "lg", "icon-sm", "icon", "icon-lg"]);
    // Se confirma que las tablas de arriba siguen coincidiendo con el paquete.
    for (const v of variantes) expect(button).toContain(`${v}: [`);

    const infracciones = [];
    for (const { path, source } of appFiles) {
      for (const m of source.matchAll(/<Button\b([\s\S]*?)>/g)) {
        const v = m[1].match(/\bvariant=["']([^"']+)["']/);
        const s = m[1].match(/\bsize=["']([^"']+)["']/);
        if (v && !variantes.has(v[1])) infracciones.push(`${path}: variant="${v[1]}"`);
        if (s && !tamanos.has(s[1])) infracciones.push(`${path}: size="${s[1]}"`);
      }
    }
    expect(infracciones).toEqual([]);
  });

  it("no existe una variante verde de botón que poder usar por error", () => {
    // Regla §4.1 del sistema: el verde es estado, nunca acción. Se hace
    // cumplir estructuralmente — no hay token del que construirla.
    expect(button).not.toMatch(/\bsuccess:\s*\[/);
    expect(readFileSync(join(SRC, "styles/tokens.css"), "utf8")).not.toContain("--btn-success");
  });
});

describe("centrado del diálogo modal (rodeo de un defecto de aguas arriba)", () => {
  const appCss = readFileSync(join(SRC, "styles/app.css"), "utf8");
  const themeCss = readFileSync(join(SRC, "styles/theme.css"), "utf8");

  it("el rodeo sigue presente en la capa de aplicación", () => {
    /*
     * En Tailwind v4 las utilidades `translate-*` compilan a la propiedad
     * `translate`, y la animación `devcon8-enter` anima esa MISMA propiedad
     * con fill-mode `both`. El resultado: el modal se queda en
     * `translate: 0 0` y aparece a 480px del centro en un viewport de 1920.
     *
     * Si alguien retira estas líneas creyéndolas superfluas, el diálogo se
     * descoloca de nuevo — y es un fallo que no rompe ninguna prueba de
     * comportamiento, solo se ve mirándolo.
     */
    expect(appCss).toContain("--devcon8-enter-x: -50%");
    expect(appCss).toContain("--devcon8-enter-y: -50%");
    expect(appCss).toContain(String.raw`.left-1\/2.top-1\/2[data-state]`);
  });

  it("sigue existiendo el defecto que justifica el rodeo", () => {
    // Si aguas arriba deja de animar `translate`, este rodeo sobra y debe
    // retirarse. Esta prueba avisa en ese momento en lugar de dejarlo ahí.
    expect(themeCss).toMatch(/@keyframes devcon8-enter[\s\S]*?translate:/);
    expect(themeCss).toContain("--devcon8-enter-x");
  });

  it("el rodeo NO alcanza a los cajones (Sheet), que sí deben deslizarse", () => {
    // SheetContent se ancla con inset-y-0 + left-0/right-0, nunca con el
    // centrado left-1/2 + top-1/2, así que el selector no lo toca.
    const sheet = overlays.split("export function SheetContent")[1].slice(0, 1200);
    expect(sheet).toContain("inset-y-0");
    expect(sheet).not.toContain("left-1/2");
    expect(sheet).not.toContain("top-1/2");
  });
});

describe("todo diálogo declara un ancho máximo", () => {
  it("ninguna llamada a DialogContent queda sin acotar", () => {
    // El fallo original no fue el valor inválido en sí, sino que el diálogo se
    // quedara SIN límite de ancho. Aquí se comprueba el efecto, no la causa:
    // cada DialogContent debe traer un `size` válido o un max-w explícito.
    const permitidos = new Set(declaredSizes(overlays, "DialogContentProps"));
    const sinAcotar = [];

    for (const { path, source } of appFiles) {
      for (const m of source.matchAll(/<DialogContent\b([\s\S]*?)>/g)) {
        const props = m[1];
        const size = props.match(/\bsize=["']([^"']+)["']/);
        const tieneMaxW = /max-w-\[/.test(props);
        const sizeValido = size && permitidos.has(size[1]);
        if (!sizeValido && !tieneMaxW) sinAcotar.push(`${path}: ${props.trim().slice(0, 60)}`);
      }
    }
    expect(sinAcotar).toEqual([]);
  });
});
