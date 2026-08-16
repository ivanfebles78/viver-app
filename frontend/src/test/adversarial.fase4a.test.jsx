/**
 * REVISIÓN ADVERSARIAL DE LA FASE 4A.
 *
 * Se debilitan a propósito las protecciones de Movimientos y se exige que
 * salten. Todas las mutaciones se hacen sobre copias en memoria, salvo las del
 * guardarraíl, que escriben y restauran el fichero en un `finally`.
 */

import { describe, it, expect } from "vitest";

import * as L from "../pages/movimientos.logic";
import { getZonasPermitidasParaCategoria, ensureZonasEspeciales, naturalSortZonas } from "../pages/movimientos.constants";


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

/* ══ 2. Las reglas de negocio que más fácil se pierden ═══════════════════ */

describe("adversarial · el orden de las reglas de tipo importa", () => {
  it("una devolución NO puede colarse como entrada", () => {
    /*
     * Toda devolución es también una entrada al vivero. Si alguien reordena las
     * reglas y pone «destino vivero → entrada» antes que la de devolución,
     * TODAS las devoluciones se registrarían como entradas y desaparecerían del
     * seguimiento de préstamos.
     */
    const devolucion = { origen_tipo: "Colegio", destino_tipo: "Vivero" };
    expect(L.getMovimientoTipo(devolucion)).toBe("devolucion");

    // La versión mutada, con las reglas al revés:
    const mutado = (m) => {
      const o = String(m?.origen_tipo || "").trim().toLowerCase();
      const d = String(m?.destino_tipo || "").trim().toLowerCase();
      if (o === "vivero" && d === "vivero") return "traslado_interno";
      if (d === "vivero") return "entrada";
      if (d === "vivero" && ["empresa", "organismo oficial", "colegio", "otro", "otros"].includes(o))
        return "devolucion";
      return "salida";
    };
    expect(mutado(devolucion)).toBe("entrada");
    expect(mutado(devolucion)).not.toBe(L.getMovimientoTipo(devolucion));
  });

  it("un traslado interno NO es una entrada", () => {
    expect(L.getMovimientoTipo({ origen_tipo: "Vivero", destino_tipo: "Vivero" })).toBe("traslado_interno");
  });

  it("las comparaciones son insensibles a mayúsculas y espacios", () => {
    expect(L.getMovimientoTipo({ origen_tipo: " VIVERO ", destino_tipo: "vivero" })).toBe("traslado_interno");
  });
});

describe("adversarial · el stock se descuenta en el sentido correcto", () => {
  it("una salida RESTA; invertir el signo dejaría existencias fantasma", () => {
    const movs = [
      { producto_id: 1, cantidad: 10, origen_tipo: "Proveedor", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M20" },
      { producto_id: 1, cantidad: 4, origen_tipo: "Vivero", destino_tipo: "UTE", zona_origen: "3a", tamano_origen: "M20" },
    ];
    const mapa = L.buildStockByProductZoneSize(movs);
    expect(mapa.get("1__3a__M20")).toBe(6);
  });

  it("un traslado interno resta en origen y suma en destino", () => {
    const movs = [
      { producto_id: 1, cantidad: 10, origen_tipo: "Proveedor", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M20" },
      { producto_id: 1, cantidad: 3, origen_tipo: "Vivero", destino_tipo: "Vivero", zona_origen: "3a", tamano_origen: "M20", zona_destino: "12", tamano_destino: "M35" },
    ];
    const mapa = L.buildStockByProductZoneSize(movs);
    expect(mapa.get("1__3a__M20")).toBe(7);
    expect(mapa.get("1__12__M35")).toBe(3);
  });

  it("la zona se normaliza a minúsculas: «3A» y «3a» son la misma", () => {
    const movs = [
      { producto_id: 1, cantidad: 5, origen_tipo: "P", destino_tipo: "Vivero", zona_destino: "3A", tamano_destino: "M20" },
      { producto_id: 1, cantidad: 5, origen_tipo: "P", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M20" },
    ];
    expect(L.buildStockByProductZoneSize(movs).get("1__3a__M20")).toBe(10);
  });

  it("un movimiento con cantidad 0 no altera el mapa", () => {
    const movs = [{ producto_id: 1, cantidad: 0, origen_tipo: "P", destino_tipo: "Vivero", zona_destino: "3a", tamano_destino: "M20" }];
    expect(L.buildStockByProductZoneSize(movs).size).toBe(0);
  });
});

describe("adversarial · las validaciones que protegen el inventario", () => {
  it("un traslado que no cambia nada se rechaza", () => {
    // Si esta regla cae, se pueden registrar traslados que no mueven nada y
    // ensucian el histórico sin alterar existencias.
    const errores = L.getFormErrors({
      producto_id: 1, cantidad: 5,
      origen_tipo: "Vivero", destino_tipo: "Vivero",
      zona_origen: "3a", zona_destino: "3a",
      tamano_origen: "M20", tamano_destino: "M20",
    });
    expect(errores).toContain("El traslado interno debe cambiar de zona o de tamaño.");
  });

  it("un destino externo exige dirección completa", () => {
    const errores = L.getFormErrors({
      producto_id: 1, cantidad: 5,
      origen_tipo: "Vivero", destino_tipo: "UTE",
      zona_origen: "3a", tamano_origen: "M20",
    });
    expect(errores).toContain("Debes seleccionar un distrito.");
    expect(errores).toContain("Debes seleccionar un barrio.");
    expect(errores).toContain("Debes indicar una dirección.");
  });

  it("una entidad externa NO puede mover hacia otra externa", () => {
    const errores = L.getFormErrors({
      producto_id: 1, cantidad: 5, origen_tipo: "Colegio", destino_tipo: "UTE",
    });
    expect(errores).toContain("Colegio solo puede mover hacia Vivero.");
  });

  it("la fecha de disponibilidad solo vale para M35 y debe ser futura", () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const iso = ayer.toISOString().slice(0, 10);

    const conM20 = L.getFormErrors({
      producto_id: 1, cantidad: 1, origen_tipo: "P", destino_tipo: "Vivero",
      zona_destino: "3a", tamano_destino: "M20", fecha_disponibilidad: iso,
    });
    expect(conM20).toContain("La fecha de disponibilidad solo aplica a movimientos a Vivero con tamaño M35.");

    const pasada = L.getFormErrors({
      producto_id: 1, cantidad: 1, origen_tipo: "P", destino_tipo: "Vivero",
      zona_destino: "3a", tamano_destino: "M35", fecha_disponibilidad: iso,
    });
    expect(pasada).toContain("La fecha de disponibilidad debe ser futura.");
  });

  it("los fitosanitarios NO exigen cantidad pero SÍ observaciones", () => {
    const config = { showCantidad: false, observacionesRequired: true };
    const errores = L.getFormErrors(
      { producto_id: 1, origen_tipo: "P", destino_tipo: "Vivero", zona_destino: "almacen-fito", tamano_destino: "M20" },
      config
    );
    expect(errores).not.toContain("La cantidad debe ser mayor que 0.");
    expect(errores.some((e) => e.includes("observaciones"))).toBe(true);
  });
});

describe("adversarial · las zonas por categoría siguen restringidas", () => {
  const ZONAS = ensureZonasEspeciales(["1", "3a", "12"]);

  it("un fitosanitario solo puede ir a su almacén", () => {
    const z = getZonasPermitidasParaCategoria({ categoria: "Fitosanitario" }, ZONAS);
    expect(z).toEqual(["almacen-fito"]);
  });

  it("un fertilizante NO puede ir al almacén de fitosanitarios", () => {
    const z = getZonasPermitidasParaCategoria({ categoria: "Fertilizantes" }, ZONAS);
    expect(z).toEqual(["almacen-fert"]);
    expect(z).not.toContain("almacen-fito");
  });

  it("una planta NO puede ir a ningún almacén especial", () => {
    const z = getZonasPermitidasParaCategoria({ categoria: "Árbol" }, ZONAS);
    for (const especial of ["almacen-fito", "almacen-general", "almacen-fert", "Zona Compostaje"]) {
      expect(z).not.toContain(especial);
    }
  });

  it("tolera tildes y mayúsculas en la categoría", () => {
    expect(getZonasPermitidasParaCategoria({ categoria: "ÁRIDOS" }, ZONAS)).toEqual(["Zona Compostaje"]);
  });
});

describe("adversarial · el orden natural de zonas", () => {
  it("«10a» va después de «9c», no antes", () => {
    // Un orden alfabético pondría «10a» antes que «2». Quien busca la zona 10
    // en una lista de treinta no la encontraría donde espera.
    const ordenadas = naturalSortZonas(["10a", "2", "9c", "1", "12"]);
    expect(ordenadas).toEqual(["1", "2", "9c", "10a", "12"]);
  });

  it("las zonas especiales van al final", () => {
    const ordenadas = naturalSortZonas(["Zona Compostaje", "3a", "almacen-fito", "1"]);
    expect(ordenadas.slice(0, 2)).toEqual(["1", "3a"]);
    expect(ordenadas.slice(2)).toContain("Zona Compostaje");
  });

  it("las zonas especiales se añaden aunque el servidor no las devuelva", () => {
    const z = ensureZonasEspeciales(["1", "2"]);
    for (const especial of ["almacen-fito", "almacen-general", "almacen-fert", "Zona Compostaje"]) {
      expect(z).toContain(especial);
    }
  });

  it("no se duplican si ya vienen del servidor", () => {
    const z = ensureZonasEspeciales(["1", "almacen-fito"]);
    expect(z.filter((x) => x === "almacen-fito")).toHaveLength(1);
  });
});

describe("adversarial · los pedidos parcialmente aprobados", () => {
  it("se pueden servir; excluirlos dejaría pedidos a medias sin salida", () => {
    const pedidos = [{ id: 1, estado: "APROBADO_PARCIAL" }];
    expect(L.filtrarPedidosAprobados(pedidos)).toHaveLength(1);

    // Variante mutada que solo acepta APROBADO:
    const mutado = pedidos.filter((p) => String(p.estado).toUpperCase() === "APROBADO");
    expect(mutado).toHaveLength(0);
  });
});
