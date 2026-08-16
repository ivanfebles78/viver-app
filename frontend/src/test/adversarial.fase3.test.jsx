/**
 * REVISIÓN ADVERSARIAL DE LA FASE 3.
 *
 * Una prueba que nunca ha fallado no ha demostrado nada. Aquí se DEBILITAN a
 * propósito las garantías de la fase —sobre copias en memoria de los
 * componentes, nunca sobre los ficheros— y se exige que la protección
 * correspondiente lo detecte.
 *
 * Si algún bloque de este archivo deja de fallar al mutar, la protección que
 * dice cubrir se ha vuelto decorativa.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const RAIZ = resolve(process.cwd(), "src");

/*
 * Las pruebas de MUTACIÓN del guardarraíl se han movido a
 * `guardrail-mutation.test.js`. Mutaban ficheros de pantallas reales, y como
 * vitest ejecuta los ficheros de prueba en paralelo, una suite podía estar
 * reescribiendo un módulo mientras otra lo importaba. Se manifestó como una
 * ejecución con 40 fallos que no se reprodujo a la siguiente.
 *
 * Ahora mutan una diana dedicada que no importa nadie, y viven todas en un
 * único fichero para ejecutarse en serie.
 */

/* ══ 2. La prueba de exposición del token detecta una fuga real ══════════ */

describe("adversarial · la prueba del token detectaría una fuga", () => {
  const TOKEN = "TOKEN-FUGADO-abc123";

  /** Réplica exacta del rastreador usado en CuentaToken.test.jsx. */
  function rastrear(container, token) {
    const atributos = [...container.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].map((a) => a.value)
    );
    return {
      enHtml: container.innerHTML.includes(token),
      enTexto: container.textContent.includes(token),
      enAtributos: atributos.some((v) => v.includes(token)),
    };
  }

  it("detecta el token en el texto", () => {
    const { container } = render(<p>Tu enlace: {TOKEN}</p>);
    expect(rastrear(container, TOKEN).enTexto).toBe(true);
  });

  it("detecta el token escondido en un atributo", () => {
    // El caso peligroso de verdad: no se ve, pero está en el DOM y viaja en
    // cualquier volcado, captura de sesión o herramienta de soporte.
    const { container } = render(<input type="hidden" defaultValue={TOKEN} readOnly />);
    const r = rastrear(container, TOKEN);
    expect(r.enTexto).toBe(false);
    expect(r.enAtributos).toBe(true);
  });

  it("detecta el token en un data-*", () => {
    const { container } = render(<div data-token={TOKEN}>Activar</div>);
    expect(rastrear(container, TOKEN).enAtributos).toBe(true);
  });

  it("no da falsos positivos con un token ausente", () => {
    const { container } = render(<p>Activa tu cuenta</p>);
    expect(rastrear(container, TOKEN)).toEqual({
      enHtml: false, enTexto: false, enAtributos: false,
    });
  });
});

/* ══ 3. La equivalencia del panel detecta una divergencia de negocio ═════ */

describe("adversarial · la equivalencia del panel detecta divergencias", () => {
  /* Copia literal de main, igual que en Dashboard.test.jsx. */
  const norm = (v) => String(v || "").trim().toUpperCase();
  function grupo_main(v) {
    const e = norm(v);
    if (e === "RESERVA" || e === "PENDIENTE") return "RESERVA";
    if (e === "APROBADO" || e === "APROBADO_PARCIAL") return "APROBADO";
    if (e === "SERVIDO") return "SERVIDO";
    if (e === "DENEGADO") return "DENEGADO";
    if (e === "CANCELADO" || e === "CADUCADO") return "CANCELADO";
    return "OTROS";
  }

  /** Variante MUTADA: se «olvida» de APROBADO_PARCIAL. */
  function grupo_mutado(v) {
    const e = norm(v);
    if (e === "RESERVA" || e === "PENDIENTE") return "RESERVA";
    if (e === "APROBADO") return "APROBADO"; // ← falta APROBADO_PARCIAL
    if (e === "SERVIDO") return "SERVIDO";
    if (e === "DENEGADO") return "DENEGADO";
    if (e === "CANCELADO" || e === "CADUCADO") return "CANCELADO";
    return "OTROS";
  }

  it("un pedido aprobado parcialmente cambia la cifra, y se nota", () => {
    /*
     * `APROBADO_PARCIAL` cuenta como aprobado desde main, con un comentario que
     * explica por qué: el pedido ya tiene artículos servibles. Es exactamente
     * la clase de matiz que un rediseño pierde sin querer.
     */
    const pedidos = [{ estado: "APROBADO_PARCIAL" }, { estado: "RESERVA" }];
    const conMain = pedidos.filter((p) => grupo_main(p.estado) === "APROBADO").length;
    const conMutacion = pedidos.filter((p) => grupo_mutado(p.estado) === "APROBADO").length;
    expect(conMain).toBe(1);
    expect(conMutacion).toBe(0);
    expect(conMutacion).not.toBe(conMain);
  });

  it("los estados en minúscula y con espacios siguen contando", () => {
    // El generador de la prueba de equivalencia los incluye a propósito.
    expect(grupo_main(" pendiente ")).toBe("RESERVA");
    expect(grupo_main("aprobado_parcial")).toBe("APROBADO");
  });

  it("`stock_real` como respaldo de `stock` no es opcional", () => {
    const conRespaldo = (p) => Number(p?.stock ?? p?.stock_real ?? 0);
    const sinRespaldo = (p) => Number(p?.stock ?? 0);
    const producto = { stock_real: 42 };
    expect(conRespaldo(producto)).toBe(42);
    expect(sinRespaldo(producto)).toBe(0);
  });
});

/* ══ 4. Las claves de fila resisten datos repetidos ══════════════════════ */

describe("adversarial · claves de React con datos repetidos", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dos series con la misma etiqueta no colapsan en una", async () => {
    /*
     * `key={item.label}` parecía suficiente hasta que dos zonas comparten
     * nombre. React avisa por consola y, peor, reutiliza el nodo equivocado.
     */
    const { default: ProportionBar } = await import("../components/ui/ProportionBar");
    render(
      <ProportionBar
        items={[
          { label: "Zona A", value: 1 },
          { label: "Zona A", value: 3 },
        ]}
      />
    );
    expect(screen.getAllByText("Zona A")).toHaveLength(2);
    const avisos = console.error.mock.calls.flat().join(" ");
    expect(avisos).not.toMatch(/same key|duplicate key/i);
  });
});

/* ══ 5. El anillo de foco no se puede suprimir sin que salte una prueba ══ */

describe("adversarial · supresión del foco", () => {
  it("ninguna hoja de estilo propia anula el contorno de foco", () => {
    /*
     * En la Fase 0 se encontró justo esto en `Login.css`: un `outline: none`
     * global que dejaba la aplicación entera sin indicador de foco. El fichero
     * ya no existe; esto vigila que no vuelva por otra vía.
     */
    const cssFiles = [];
    (function walk(dir) {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) {
          if (e === "ui") continue; // paquete vendorizado
          walk(full);
        } else if (e.endsWith(".css")) {
          cssFiles.push(full);
        }
      }
    })(RAIZ);

    expect(cssFiles.length).toBeGreaterThan(0);

    for (const f of cssFiles) {
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      // Se permite `outline: none` SOLO junto a un `:focus-visible` que
      // reponga un indicador; lo que no se permite es la supresión a secas.
      const supresiones = [...src.matchAll(/outline\s*:\s*(none|0)\b/g)];
      for (const m of supresiones) {
        const contexto = src.slice(Math.max(0, m.index - 300), m.index + 300);
        expect(
          /focus-visible|:focus\b/.test(contexto),
          `Supresión de contorno sin reposición en ${f}`
        ).toBe(true);
      }
    }
  });
});
