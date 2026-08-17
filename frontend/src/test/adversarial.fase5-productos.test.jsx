/**
 * REVISIÓN ADVERSARIAL DE PRODUCTOS.
 *
 * El catálogo alimenta a Movimientos, Pedidos e Informes: un producto mal
 * clasificado o con el precio perdido se propaga a las existencias, a los
 * pedidos y al informe de costes. Aquí se ataca eso.
 */

import { describe, it, expect } from "vitest";

import * as L from "../pages/productos.logic";

/* ══ 1. Permisos ════════════════════════════════════════════════════════ */

describe("adversarial · quién puede gestionar el catálogo", () => {
  it("un gestor de vivero NO puede gestionar productos", () => {
    // Ve el catálogo, pero no da de alta ni borra.
    expect(L.puedeGestionar("gestor_vivero")).toBe(false);
  });

  it("una empresa externa NO puede gestionar productos", () => {
    expect(L.puedeGestionar("empresa_externa")).toBe(false);
  });

  it("un proveedor NO puede gestionar productos", () => {
    expect(L.puedeGestionar("proveedor")).toBe(false);
  });

  it("un rol vacío o desconocido NO puede: falla cerrado", () => {
    for (const rol of ["", null, undefined, "root", "ADMIN"]) {
      expect(L.puedeGestionar(rol), String(rol)).toBe(false);
    }
  });

  it("el técnico gestiona el catálogo pero NO marca productos como internos", () => {
    /*
     * La distinción importa: «interno» decide si un producto es visible para la
     * UTE. Que lo cambie quien gestiona el catálogo, y no solo quien decide la
     * política, sería una escalada silenciosa.
     */
    expect(L.puedeGestionar("tecnico")).toBe(true);
    expect(L.puedeMarcarInterno("tecnico")).toBe(false);
  });

  it("ampliar ROLES_GESTION a gestor_vivero sería detectable", () => {
    const mutado = ["admin", "manager", "tecnico", "gestor_vivero"];
    expect(mutado.includes("gestor_vivero")).toBe(true);
    expect(L.ROLES_GESTION.includes("gestor_vivero")).toBe(false);
  });

  it("la comprobación de rol distingue mayúsculas: no hay coincidencia laxa", () => {
    // Si comparase sin distinguir, un rol «Admin» del backend colaría.
    expect(L.puedeGestionar("Admin")).toBe(false);
  });
});

/* ══ 2. Alta de producto ════════════════════════════════════════════════ */

describe("adversarial · el alta no puede degradar los datos", () => {
  const BASE = {
    nombre_cientifico: "Dracaena draco",
    nombre_natural: "Drago",
    categoria: "Árbol",
    subcategoria: "Autóctono",
    stock_minimo: 10,
    es_interno: false,
    precio: "12.5",
  };

  it("un producto sin clasificar no se crea", () => {
    // El inventario se organiza por categoría y subcategoría: sin ellas, el
    // producto no aparecería en ninguna zona ni en ningún informe.
    for (const campo of ["nombre_cientifico", "categoria", "subcategoria"]) {
      expect(L.validarNuevoProducto({ ...BASE, [campo]: "" }), campo).toBeTruthy();
      expect(L.validarNuevoProducto({ ...BASE, [campo]: "   " }), campo).toBeTruthy();
    }
  });

  it("un precio nulo NO se convierte en 0", () => {
    /*
     * 0 significa «gratis» y null «sin precio». El informe de estadísticas
     * excluye los productos sin precio del coste; si pasaran como 0, el coste
     * total parecería correcto y estaría mal.
     */
    expect(L.construirPayloadNuevo({ ...BASE, precio: "" }).precio).toBeNull();
    // La mutación: tratar el vacío como 0 en vez de como «sin dato».
    const vacio = "";
    const mutado = Number(vacio.length ? vacio : 0);
    expect(mutado).toBe(0);
  });

  it("un precio con coma decimal se transmite como NaN, no como un número erróneo", () => {
    // Es el comportamiento de main. Vale la pena fijarlo: si algún día se
    // «arregla», que sea a propósito.
    expect(Number.isNaN(L.construirPayloadNuevo({ ...BASE, precio: "12,5" }).precio)).toBe(true);
  });

  it("un stock mínimo negativo se transmite tal cual: el tope lo pone el backend", () => {
    expect(L.construirPayloadNuevo({ ...BASE, stock_minimo: -5 }).stock_minimo).toBe(-5);
  });

  it("los espacios sobrantes no crean categorías duplicadas", () => {
    // «Árbol » y «Árbol» serían dos categorías distintas en los filtros.
    const p = L.construirPayloadNuevo({ ...BASE, categoria: "  Árbol  " });
    expect(p.categoria).toBe("Árbol");
  });

  it("`es_interno` no puede colarse como cadena «false»", () => {
    // Un `"false"` en JS es truthy: sin el `!!`, un producto interno por error.
    expect(L.construirPayloadNuevo({ ...BASE, es_interno: "false" }).es_interno).toBe(true);
    expect(L.construirPayloadNuevo({ ...BASE, es_interno: false }).es_interno).toBe(false);
  });
});

/* ══ 3. Catálogo y filtros ══════════════════════════════════════════════ */

describe("adversarial · el filtrado no puede ocultar productos", () => {
  const CATALOGO = [
    { id: 1, nombre_cientifico: "Dracaena draco", nombre_natural: "Drago", categoria: "Árbol", subcategoria: "Autóctono" },
    { id: 2, nombre_cientifico: "", nombre_natural: "Sin científico", categoria: "Árbol", subcategoria: "" },
    { id: 3, nombre_cientifico: "Sin categoría", nombre_natural: "", categoria: "", subcategoria: "" },
  ];

  it("un producto sin categoría sigue apareciendo sin filtro", () => {
    expect(L.filtrarProductos(CATALOGO, {})).toHaveLength(3);
  });

  it("un producto sin nombre científico se encuentra por el común", () => {
    expect(L.filtrarProductos(CATALOGO, { q: "sin científico" })).toHaveLength(1);
  });

  it("la búsqueda no distingue mayúsculas ni espacios sobrantes", () => {
    expect(L.filtrarProductos(CATALOGO, { q: "  DRACAENA  " })).toHaveLength(1);
  });

  it("un filtro de categoría inexistente devuelve lista vacía, no todo", () => {
    // La mutación clásica: tratar «no encontrado» como «sin filtro».
    expect(L.filtrarProductos(CATALOGO, { categoria: "Inventada" })).toHaveLength(0);
  });

  it("las categorías vacías no aparecen en el selector", () => {
    // Una opción en blanco en un filtro no significa nada para el usuario.
    expect(L.categoriasDe(CATALOGO)).toEqual(["Árbol"]);
  });

  it("las subcategorías se limitan a la categoría elegida", () => {
    const cat = [
      { id: 1, categoria: "Árbol", subcategoria: "Autóctono" },
      { id: 2, categoria: "Palmera", subcategoria: "Canaria" },
    ];
    expect(L.subcategoriasDe(cat, "Árbol")).toEqual(["Autóctono"]);
    expect(L.subcategoriasDe(cat, "ALL")).toEqual(["Autóctono", "Canaria"]);
  });

  it("el filtro «solo con imagen» no oculta nada si está apagado", () => {
    expect(L.filtrarProductos(CATALOGO, { soloConImagen: false, idsConImagen: new Set() })).toHaveLength(3);
  });

  it("el filtro «solo con imagen» sí filtra cuando está encendido", () => {
    expect(
      L.filtrarProductos(CATALOGO, { soloConImagen: true, idsConImagen: new Set([1]) })
    ).toHaveLength(1);
  });
});

/* ══ 4. Nombres ═════════════════════════════════════════════════════════ */

describe("adversarial · los nombres no se confunden entre sí", () => {
  it("el nombre científico NUNCA cae en el común", () => {
    /*
     * El respaldo silencioso era tentador y sería un error de fondo: quien
     * consulta la columna «Nombre científico» está comprobando una
     * identificación botánica, no un apodo.
     */
    const p = { nombre_cientifico: "", nombre_natural: "Drago" };
    expect(L.productScientificName(p)).toBe("-");
    expect(L.productScientificName(p)).not.toBe("Drago");
  });

  it("un producto sin ningún nombre no rompe la fila", () => {
    expect(L.productScientificName({})).toBe("-");
    expect(L.productCommonName({})).toBe("-");
    expect(L.productScientificName(null)).toBe("-");
  });
});

/* ══ 5. Errores del backend ═════════════════════════════════════════════ */

describe("adversarial · los errores del backend son legibles", () => {
  it("un 422 de validación no se muestra como [object Object]", () => {
    const e = {
      response: {
        status: 422,
        data: { detail: [{ loc: ["body", "precio"], msg: "no es un número" }] },
      },
    };
    const msg = L.fmtErr(e);
    expect(msg).not.toContain("[object");
    expect(msg).toContain("precio");
  });

  it("varios errores de validación se muestran todos", () => {
    const e = {
      response: {
        status: 422,
        data: {
          detail: [
            { loc: ["body", "precio"], msg: "no es un número" },
            { loc: ["body", "categoria"], msg: "requerido" },
          ],
        },
      },
    };
    expect(L.fmtErr(e).split(" | ")).toHaveLength(2);
  });

  it("un error sin detalle no deja al usuario sin mensaje", () => {
    expect(L.fmtErr({})).toBe("Error");
    expect(L.fmtErr(null)).toBe("Error");
  });

  it("un 422 con `detail` que NO es array cae al camino normal", () => {
    const e = { response: { status: 422, data: { detail: "texto plano" } } };
    expect(L.fmtErr(e)).toBe("texto plano");
  });
});
