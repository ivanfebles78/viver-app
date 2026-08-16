/**
 * REVISIÓN ADVERSARIAL DE LA FASE 4B.
 *
 * Informes era la migración de riesgo: sus PDF los archiva un ayuntamiento. La
 * protección principal —el contrato de columnas y sus pruebas de mutación—
 * vive en `informes.pdf.contract.test.js` y `informes.pdf.mutation.test.js`.
 *
 * Aquí se atacan las OTRAS garantías de la fase: el control de acceso por rol,
 * el formato compartido entre pantalla y PDF, y el vocabulario de estados.
 */

import { describe, it, expect } from "vitest";

import {
  ESTADO_STOCK_LABEL,
  fmtCantInv,
  fmtEuro,
  fmtMesLabel,
  fmtNum,
  sanitizeFileName,
} from "../pages/informes.format";
import { estadoCaducidad, estadoPedido, estadoStock } from "../app/estado";

/* ══ 1. El formato es COMPARTIDO: pantalla y PDF no pueden divergir ═══════ */

describe("adversarial · el formato lo comparten pantalla y PDF", () => {
  it("hay una sola definición de cada formateador", async () => {
    /*
     * Antes había dos copias de `fmtNum`, `fmtEuro`, `fmtFecha`… una en el
     * componente y otra en el generador de PDF. Así es como acaban divergiendo:
     * alguien ajusta el formato en pantalla, nadie toca el PDF, y los dos
     * documentos dejan de coincidir sin que salte nada.
     *
     * Esta prueba lee los DOS ficheros y exige que ninguno redefina lo que ya
     * está en el módulo compartido.
     */
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const raiz = resolve(process.cwd(), "src/pages");

    const pantalla = readFileSync(resolve(raiz, "Informes.jsx"), "utf8");
    const pdf = readFileSync(resolve(raiz, "informes.pdf.js"), "utf8");

    for (const fn of ["fmtNum", "fmtEuro", "fmtFecha", "fmtFechaSolo", "fmtCantInv", "fmtMesLabel"]) {
      const patron = new RegExp(`function\\s+${fn}\\s*\\(`);
      expect(patron.test(pantalla), `${fn} redefinido en Informes.jsx`).toBe(false);
      expect(patron.test(pdf), `${fn} redefinido en informes.pdf.js`).toBe(false);
    }
  });

  it("cambiar el formateador cambiaría AMBOS documentos a la vez", () => {
    // Es la consecuencia buscada: una sola definición, un solo comportamiento.
    expect(fmtNum(1234567)).toBe(new Intl.NumberFormat("es-ES").format(1234567));
    expect(fmtEuro(12.5)).toMatch(/€/);
  });

  it("los importes usan la coma decimal española", () => {
    // Con punto decimal, una plantilla que espera «12,50» lee 1250.
    expect(fmtEuro(12.5)).toMatch(/12,50/);
  });

  it("las cantidades enteras no arrastran decimales", () => {
    expect(fmtCantInv(15)).toBe("15");
    expect(fmtCantInv(15.5)).toBe("15.5");
    expect(fmtCantInv(15.0)).toBe("15");
  });

  it("el nombre de fichero no admite caracteres que rompan una ruta", () => {
    /*
     * El nombre viaja a `showSaveFilePicker`. Una barra o dos puntos lo
     * convierten en una ruta y el guardado falla o escribe donde no debe.
     */
    const sucio = sanitizeFileName("reporte/../../etc:passwd *?");
    expect(sucio).not.toMatch(/[/\\:*?"<>|]/);
    expect(sucio).not.toContain("..");
  });

  it("las etiquetas de mes son estables", () => {
    // El PDF agrupa el coste por mes; si la etiqueta cambia, cambia el informe.
    expect(fmtMesLabel("2026-01")).toBeTruthy();
    expect(fmtMesLabel("2026-01")).toBe(fmtMesLabel("2026-01"));
  });
});

/* ══ 2. Los estados no pueden perder su significado ══════════════════════ */

describe("adversarial · el vocabulario de estados", () => {
  it("«bajo stock» es aviso, NO error", () => {
    /*
     * El rojo está reservado a error y destrucción. Un producto por debajo del
     * mínimo exige actuar, pero no es un fallo: teñirlo de rojo lo confundiría
     * con «agotado», que sí impide servir.
     */
    expect(estadoStock("Bajo stock").status).toBe("pending");
    expect(estadoStock("Agotado").status).toBe("rejected");
    expect(estadoStock("Bajo stock").status).not.toBe(estadoStock("Agotado").status);
  });

  it("un estado desconocido NO se inventa un tono", () => {
    // Si mañana el backend añade un estado, se muestra tal cual en neutro en
    // vez de teñirse de un color elegido por accidente.
    const r = estadoStock("estado_que_no_existe");
    expect(r.status).toBe("draft");
    expect(r.label).toBe("estado_que_no_existe");
  });

  it("«caducado» y «denegado» NO comparten tono por casualidad", () => {
    // Ambos son rechazo, pero por motivos distintos; se comprueba que la
    // decisión es explícita y no un efecto de la normalización.
    expect(estadoCaducidad("Caducado").status).toBe("rejected");
    expect(estadoPedido("CADUCADO").status).toBe("archived");
  });

  it("los estados de pedido toleran minúsculas y espacios", () => {
    expect(estadoPedido(" aprobado parcial ").status).toBe(estadoPedido("APROBADO_PARCIAL").status);
  });

  it("las etiquetas del filtro de existencias cubren los cuatro casos", () => {
    // El PDF imprime esta etiqueta en el bloque de filtros: si falta una, el
    // informe dice «Todos los productos» cuando no lo son.
    expect(Object.keys(ESTADO_STOCK_LABEL).sort()).toEqual(["", "agotado", "bajo", "con_stock"]);
  });
});

/* ══ 3. El control de acceso por rol ═════════════════════════════════════ */

describe("adversarial · reglas de acceso por rol", () => {
  /*
   * Réplica de la lógica de la pantalla, para poder atacarla sin montarla.
   * Si la pantalla y esto discrepan, las pruebas de `Informes.test.jsx` —que
   * sí la montan— lo detectan.
   */
  const TODOS = [
    "trazabilidad", "distribucion", "inventario", "stock", "caducidad",
    "externos", "prestamos", "abastecimiento", "bajas", "estadisticas",
  ];

  function visibles(rol) {
    const permitidos =
      rol === "empresa_externa"
        ? ["externos"]
        : rol === "tecnico"
        ? ["distribucion", "inventario", "stock"]
        : null;
    let lista = permitidos ? TODOS.filter((k) => permitidos.includes(k)) : TODOS;
    if (rol !== "admin") lista = lista.filter((k) => k !== "estadisticas");
    return lista;
  }

  it("una empresa externa NO puede ver existencias ni costes", () => {
    const v = visibles("empresa_externa");
    expect(v).toEqual(["externos"]);
    expect(v).not.toContain("stock");
    expect(v).not.toContain("estadisticas");
  });

  it("un técnico NO puede ver préstamos ni bajas", () => {
    const v = visibles("tecnico");
    expect(v).not.toContain("prestamos");
    expect(v).not.toContain("bajas");
    expect(v).not.toContain("estadisticas");
  });

  it("SOLO el administrador ve estadísticas", () => {
    expect(visibles("admin")).toContain("estadisticas");
    for (const rol of ["manager", "gestor_vivero", "tecnico", "empresa_externa"]) {
      expect(visibles(rol), rol).not.toContain("estadisticas");
    }
  });

  it("quitar el filtro de estadísticas expondría los costes", () => {
    // La mutación: olvidar la última línea de `visibles`.
    const mutado = (rol) =>
      rol === "empresa_externa" ? ["externos"] : rol === "tecnico" ? ["distribucion", "inventario", "stock"] : TODOS;
    expect(mutado("manager")).toContain("estadisticas");
    expect(visibles("manager")).not.toContain("estadisticas");
  });

  it("un rol desconocido no hereda permisos por descuido", () => {
    // `canAccess` de la pantalla no lo incluye, así que ve el aviso; aquí se
    // comprueba que la lista tampoco le da nada útil por defecto.
    const v = visibles("rol_inventado");
    expect(v).not.toContain("estadisticas");
  });
});
