/**
 * EQUIVALENCIA — Plataforma.
 *
 * Cada bloque `MAIN` es una copia LITERAL de `Plataforma.jsx@607552d`, pegada
 * antes de tocar nada. Se compara la lógica extraída con esa copia.
 *
 * El bloque final MUTA las reglas a propósito para demostrar que el contrato
 * detecta que se debiliten.
 */

import { describe, it, expect } from "vitest";

import * as L from "./plataforma.logic";

/* ══ COPIA LITERAL DE MAIN ══════════════════════════════════════════════ */

const MAIN_money = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);

const MAIN_onNombre = (f, v) => {
  const autoSlug = v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const slugTouched = f.slug && f.slug !== f._autoSlug;
  return { ...f, nombre: v, slug: slugTouched ? f.slug : autoSlug, _autoSlug: autoSlug };
};

const MAIN_payload = (form) => ({
  nombre: form.nombre,
  slug: form.slug,
  cif: form.cif || null,
  direccion: form.direccion || null,
  email_contacto: form.email_contacto || null,
  telefono: form.telefono || null,
  admin_username: form.admin_username,
  admin_email: form.admin_email,
  admin_rol: form.admin_rol,
});

/** Copia literal del cuerpo de `guardarCuota` antes de llamar al backend. */
const MAIN_cuota = (value) => {
  const raw = String(value ?? "").trim().replace(",", ".");
  const num = raw === "" ? null : Number(raw);
  if (num !== null && (Number.isNaN(num) || num < 0)) {
    return { rechazada: true, num: null };
  }
  return { rechazada: false, num };
};

const MAIN_kpis = (resumen) => [
  { k: "Ayuntamientos", v: resumen?.ayuntamientos_total, sub: `${resumen?.ayuntamientos_activos ?? 0} activos` },
  { k: "Usuarios", v: resumen?.usuarios_total },
  { k: "Productos", v: resumen?.productos_total },
  { k: "Pedidos", v: resumen?.pedidos_total },
  { k: "Movimientos", v: resumen?.movimientos_total },
];

const MAIN_chart = (data) => {
  const W = 640, H = 220, P = 34;
  const pts = data.map((d) => ({ x: d.mes, y: d.acumulado }));
  const maxY = Math.max(1, ...pts.map((p) => p.y));
  const stepX = pts.length > 1 ? (W - 2 * P) / (pts.length - 1) : 0;
  const px = (i) => P + i * stepX;
  const py = (v) => H - P - (v / maxY) * (H - 2 * P);
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(p.y)}`).join(" ");
  const areaPath = `${linePath} L ${px(pts.length - 1)} ${H - P} L ${px(0)} ${H - P} Z`;
  return { maxY, linePath, areaPath };
};

/* ══ DATOS ══════════════════════════════════════════════════════════════ */

const NOMBRES = [
  "",
  "La Laguna",
  "Ayuntamiento de La Laguna",
  "SANTA CRUZ",
  "  Güímar  ",
  "Villa de Arico",
  "San Cristóbal de La Laguna",
  "Puerto de la Cruz (norte)",
  "-- raro --",
  "123",
  "áéíóú ñÑ çÇ",
];

const CUOTAS = [
  "", "   ", "0", "0,00", "19,90", "19.90", "199", "-1", "-0.01",
  "abc", "1e3", "  250  ", null, undefined, "1,5,5", "Infinity", "0x10",
];

/* ══ EQUIVALENCIA ═══════════════════════════════════════════════════════ */

describe("equivalencia · formato de moneda", () => {
  it("coincide en valores normales, cero, nulo y negativo", () => {
    for (const v of [0, 199, 19.9, null, undefined, -50, 1234567.89]) {
      expect(L.money(v), String(v)).toBe(MAIN_money(v));
    }
  });
});

describe("equivalencia · slug", () => {
  it("el autocompletado coincide sobre un formulario limpio", () => {
    for (const n of NOMBRES) {
      const base = { slug: "", _autoSlug: "" };
      expect(L.aplicarNombre(base, n), n).toEqual(MAIN_onNombre(base, n));
    }
  });

  it("coincide cuando el usuario YA tocó el slug", () => {
    for (const n of NOMBRES) {
      const tocado = { slug: "mi-slug-propio", _autoSlug: "otro" };
      expect(L.aplicarNombre(tocado, n), n).toEqual(MAIN_onNombre(tocado, n));
    }
  });

  it("coincide en la cadena de tecleo carácter a carácter", () => {
    // Es el caso real: el usuario escribe letra a letra y el slug le sigue.
    let mio = { slug: "", _autoSlug: "" };
    let suyo = { slug: "", _autoSlug: "" };
    for (const parcial of ["A", "Ay", "Ayu", "Ayunt", "Ayuntamiento", "Ayuntamiento de Arico"]) {
      mio = L.aplicarNombre(mio, parcial);
      suyo = MAIN_onNombre(suyo, parcial);
      expect(mio, parcial).toEqual(suyo);
    }
  });
});

describe("equivalencia · payload de alta", () => {
  const FORMS = [
    { nombre: "A", slug: "a", cif: "", direccion: "", email_contacto: "", telefono: "", admin_username: "u", admin_email: "e", admin_rol: "admin" },
    { nombre: "B", slug: "b", cif: "X1", direccion: "C/ 1", email_contacto: "a@b.c", telefono: "922", admin_username: "u2", admin_email: "e2", admin_rol: "admin_vivero" },
  ];

  it("coincide con main", () => {
    for (const f of FORMS) expect(L.construirPayloadEnroll(f)).toEqual(MAIN_payload(f));
  });
});

describe("equivalencia · cuota", () => {
  it("coincide la decisión y el número en todos los valores de prueba", () => {
    const mios = CUOTAS.map((v) => {
      const r = L.parsearCuota(v);
      return [String(v), !r.valida, r.num];
    });
    const suyos = CUOTAS.map((v) => {
      const r = MAIN_cuota(v);
      return [String(v), r.rechazada, r.num];
    });
    expect(mios).toEqual(suyos);
  });
});

describe("equivalencia · KPIs", () => {
  it("coincide con y sin resumen", () => {
    for (const r of [
      undefined,
      null,
      {},
      { ayuntamientos_total: 3, ayuntamientos_activos: 2, usuarios_total: 30, productos_total: 100, pedidos_total: 40, movimientos_total: 900 },
    ]) {
      expect(L.construirKpis(r)).toEqual(MAIN_kpis(r));
    }
  });
});

describe("equivalencia · geometría de la gráfica", () => {
  const SERIES = [
    [{ mes: "2026-01", acumulado: 1 }],
    [
      { mes: "2026-01", acumulado: 1 },
      { mes: "2026-02", acumulado: 3 },
      { mes: "2026-03", acumulado: 7 },
    ],
    [
      { mes: "2026-01", acumulado: 0 },
      { mes: "2026-02", acumulado: 0 },
    ],
  ];

  it("los trazados coinciden exactamente", () => {
    for (const s of SERIES) {
      const mio = L.geometriaEvolucion(s);
      const suyo = MAIN_chart(s);
      expect(mio.maxY).toBe(suyo.maxY);
      expect(mio.linePath).toBe(suyo.linePath);
      expect(mio.areaPath).toBe(suyo.areaPath);
    }
  });

  it("sin datos devuelve null en vez de romper", () => {
    for (const v of [[], null, undefined, "no soy un array"]) {
      expect(L.geometriaEvolucion(v), String(v)).toBeNull();
    }
  });
});

/* ══ CONTRATO ═══════════════════════════════════════════════════════════ */

describe("contrato · la cuota vacía NO es cero", () => {
  it("vacío viaja como null: es «cuota por defecto», no «gratis»", () => {
    for (const v of ["", "   ", null, undefined]) {
      const r = L.parsearCuota(v);
      expect(r.valida, String(v)).toBe(true);
      expect(r.num, String(v)).toBeNull();
    }
  });

  it("un cero explícito SÍ viaja como 0", () => {
    // «Gratis» es una decisión comercial legítima y distinta de «por defecto».
    expect(L.parsearCuota("0").num).toBe(0);
    expect(L.parsearCuota("0,00").num).toBe(0);
  });

  it("acepta la coma decimal española", () => {
    expect(L.parsearCuota("19,90").num).toBeCloseTo(19.9);
  });

  it("un negativo se rechaza sin llegar al backend", () => {
    const r = L.parsearCuota("-1");
    expect(r.valida).toBe(false);
    expect(r.num).toBeNull();
    expect(r.error).toBe(L.CUOTA_INVALIDA);
  });

  it("un texto se rechaza", () => {
    expect(L.parsearCuota("abc").valida).toBe(false);
  });

  it("el payload lleva siempre set_cuota", () => {
    // Sin `set_cuota`, el backend no distingue «no lo toques» de «ponlo a null».
    expect(L.construirPayloadCuota(null)).toEqual({ set_cuota: true, cuota_mensual: null });
    expect(L.construirPayloadCuota(0)).toEqual({ set_cuota: true, cuota_mensual: 0 });
  });
});

describe("contrato · el estado interno no se envía", () => {
  it("`_autoSlug` nunca aparece en el payload de alta", () => {
    const form = L.aplicarNombre(
      { slug: "", _autoSlug: "", cif: "", direccion: "", email_contacto: "", telefono: "", admin_username: "u", admin_email: "e", admin_rol: "admin" },
      "Ayuntamiento de Arico"
    );
    expect(form._autoSlug).toBe("ayuntamiento-de-arico");
    expect(Object.keys(L.construirPayloadEnroll(form))).not.toContain("_autoSlug");
  });

  it("los opcionales vacíos viajan como null y no como cadena vacía", () => {
    const p = L.construirPayloadEnroll({
      nombre: "A", slug: "a", cif: "", direccion: "", email_contacto: "", telefono: "",
      admin_username: "u", admin_email: "e", admin_rol: "admin",
    });
    for (const campo of ["cif", "direccion", "email_contacto", "telefono"]) {
      expect(p[campo], campo).toBeNull();
    }
  });
});

describe("contrato · el slug deja de seguir al nombre cuando lo tocas", () => {
  it("mientras no se toca, sigue al nombre", () => {
    let f = { slug: "", _autoSlug: "" };
    f = L.aplicarNombre(f, "La Laguna");
    expect(f.slug).toBe("la-laguna");
    f = L.aplicarNombre(f, "La Orotava");
    expect(f.slug).toBe("la-orotava");
  });

  it("una vez tocado, el nombre ya no lo pisa", () => {
    let f = L.aplicarNombre({ slug: "", _autoSlug: "" }, "La Laguna");
    f = { ...f, slug: "laguna-2026" }; // el usuario lo edita
    f = L.aplicarNombre(f, "Otro Nombre");
    expect(f.slug).toBe("laguna-2026");
  });
});

/* ══ MUTACIÓN ═══════════════════════════════════════════════════════════ */

describe("mutación · el contrato detecta que se debiliten las reglas", () => {
  const detecta = (mutado, real) => {
    try {
      expect(mutado).toEqual(real);
      return "no detecta";
    } catch {
      return "detecta";
    }
  };

  it("detecta que una cuota vacía pase a valer 0", () => {
    const real = L.parsearCuota("").num;
    const vacio = "";
    const mutado = Number(vacio.length ? vacio : 0); // mutación: «vacío es cero»
    expect(real).toBeNull();
    expect(mutado).toBe(0);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que se acepte una cuota negativa", () => {
    const real = L.parsearCuota("-5").valida;
    const mutado = !Number.isNaN(Number("-5")); // sin la comprobación de < 0
    expect(real).toBe(false);
    expect(mutado).toBe(true);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que se pierda la coma decimal", () => {
    const real = L.parsearCuota("19,90").num;
    const mutado = Number("19,90"); // sin el reemplazo → NaN
    expect(real).toBeCloseTo(19.9);
    expect(Number.isNaN(mutado)).toBe(true);
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que `_autoSlug` se cuele en el payload", () => {
    const form = L.aplicarNombre({ slug: "", _autoSlug: "" }, "Arico");
    const real = Object.keys(L.construirPayloadEnroll(form)).sort();
    const mutado = Object.keys({ ...L.construirPayloadEnroll(form), _autoSlug: form._autoSlug }).sort();
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que el slug siga pisándose después de tocarlo", () => {
    let f = L.aplicarNombre({ slug: "", _autoSlug: "" }, "La Laguna");
    f = { ...f, slug: "mio" };
    const real = L.aplicarNombre(f, "Otro").slug;
    const mutado = L.slugify("Otro"); // autocompletado incondicional
    expect(real).toBe("mio");
    expect(detecta(mutado, real)).toBe("detecta");
  });

  it("detecta que un opcional vacío viaje como cadena vacía", () => {
    const form = { nombre: "A", slug: "a", cif: "", admin_username: "u", admin_email: "e", admin_rol: "admin" };
    const real = L.construirPayloadEnroll(form).cif;
    const mutado = form.cif; // sin el `|| null`
    expect(real).toBeNull();
    expect(mutado).toBe("");
    expect(detecta(mutado, real)).toBe("detecta");
  });
});
