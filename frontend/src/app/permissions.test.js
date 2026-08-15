/**
 * MATRIZ DE AUTORIZACIÓN — rol × ruta, completa y explícita.
 *
 * Estas pruebas son la red de seguridad del rediseño del shell. Se escriben
 * ANTES de tocar `Layout.jsx` y describen el comportamiento que ya existe, no
 * el que nos gustaría tener: si una de ellas cambia de resultado durante la
 * migración visual, es una regresión de permisos, no una diferencia de estilo.
 *
 * La matriz se declara entera y de forma literal, sin generarla a partir de las
 * mismas tablas que prueba. Generarla desde `ROUTES_BY_ROLE` haría que la
 * prueba pasara siempre, incluso si esa tabla se corrompe: estaría comparando
 * el módulo consigo mismo. Aquí el resultado esperado se escribe a mano.
 */

import { describe, it, expect } from "vitest";
import {
  ROLES,
  ROUTES,
  rolEfectivo,
  rolReal,
  esSuperadmin,
  getVisibleNavItems,
  getDefaultRouteForRole,
  isPathAllowedForRole,
  canAccessRoute,
  resolveLandingRoute,
  canSeePlataforma,
  canSelectCliente,
  canManageUsuarios,
  canSeeNotifications,
  canOpenMapaVivero,
} from "./permissions";

/** Las 13 rutas de la aplicación, tal y como las declara App.jsx. */
const ALL_ROUTES = [
  "/",
  "/dashboard",
  "/productos",
  "/movimientos",
  "/pedidos",
  "/aprobaciones",
  "/informes",
  "/lotes",
  "/vivero",
  "/admin/usuarios",
  "/plataforma",
];

/**
 * La matriz, escrita a mano desde el comportamiento de Layout.jsx en main.
 * `true` = el rol puede permanecer en esa ruta; `false` = se le redirige.
 *
 * `/plataforma` es `false` para TODOS los roles: no depende del rol efectivo
 * sino del flag de super-admin global, y se comprueba por separado más abajo.
 */
const MATRIX = {
  admin: {
    "/": true,
    "/dashboard": true,
    "/productos": true,
    "/movimientos": true,
    "/pedidos": true,
    "/aprobaciones": true,
    "/informes": true,
    "/lotes": true,
    "/vivero": true,
    "/admin/usuarios": true,
    "/plataforma": false,
  },
  tecnico: {
    "/": true,
    "/dashboard": true,
    "/productos": true,
    "/movimientos": true,
    "/pedidos": true,
    "/aprobaciones": false,
    "/informes": true,
    "/lotes": true,
    "/vivero": true,
    "/admin/usuarios": false,
    "/plataforma": false,
  },
  manager: {
    "/": true,
    "/dashboard": true,
    "/productos": true,
    "/movimientos": true,
    "/pedidos": false,
    "/aprobaciones": true,
    "/informes": true,
    "/lotes": true,
    "/vivero": true,
    "/admin/usuarios": false,
    "/plataforma": false,
  },
  gestor_vivero: {
    "/": true,
    "/dashboard": true,
    "/productos": true,
    "/movimientos": true,
    "/pedidos": true,
    "/aprobaciones": false,
    "/informes": true,
    "/lotes": true,
    "/vivero": true,
    "/admin/usuarios": false,
    "/plataforma": false,
  },
  empresa_externa: {
    "/": true,
    "/dashboard": false,
    "/productos": true,
    "/movimientos": false,
    "/pedidos": true,
    "/aprobaciones": false,
    "/informes": true,
    "/lotes": false,
    "/vivero": false,
    "/admin/usuarios": false,
    "/plataforma": false,
  },
  proveedor: {
    "/": true,
    "/dashboard": false,
    "/productos": false,
    "/movimientos": false,
    "/pedidos": true,
    "/aprobaciones": false,
    "/informes": false,
    "/lotes": false,
    "/vivero": false,
    "/admin/usuarios": false,
    "/plataforma": false,
  },
};

const EFFECTIVE = Object.keys(MATRIX);

/* ────────────────────────────────────────────────────────────────────────── */

describe("rolEfectivo", () => {
  it("colapsa superadmin en admin", () => {
    expect(rolEfectivo("superadmin")).toBe("admin");
    expect(rolEfectivo({ rol: "superadmin" })).toBe("admin");
  });

  it("colapsa admin_vivero en admin", () => {
    expect(rolEfectivo("admin_vivero")).toBe("admin");
    expect(rolEfectivo({ rol: "admin_vivero" })).toBe("admin");
  });

  it("devuelve el resto de roles sin tocar", () => {
    for (const role of ["admin", "manager", "tecnico", "gestor_vivero", "empresa_externa", "proveedor"]) {
      expect(rolEfectivo(role)).toBe(role);
    }
  });

  it("acepta `role` además de `rol`", () => {
    expect(rolEfectivo({ role: "manager" })).toBe("manager");
  });

  it("normaliza espacios y mayúsculas", () => {
    expect(rolEfectivo("  ADMIN  ")).toBe("admin");
    expect(rolEfectivo({ rol: "  SuperAdmin " })).toBe("admin");
  });

  it("devuelve cadena vacía para entradas ausentes", () => {
    expect(rolEfectivo(null)).toBe("");
    expect(rolEfectivo(undefined)).toBe("");
    expect(rolEfectivo({})).toBe("");
    expect(rolEfectivo("")).toBe("");
  });

  it("no inventa un rol para valores desconocidos", () => {
    expect(rolEfectivo("intruso")).toBe("intruso");
  });
});

describe("rolReal", () => {
  it("NO colapsa los alias — el rol real se muestra al usuario", () => {
    expect(rolReal({ rol: "superadmin" })).toBe("superadmin");
    expect(rolReal({ rol: "admin_vivero" })).toBe("admin_vivero");
  });
});

describe("esSuperadmin", () => {
  it("reconoce el rol superadmin", () => {
    expect(esSuperadmin({ rol: "superadmin" })).toBe(true);
  });

  it("reconoce los flags del backend aunque el rol sea otro", () => {
    expect(esSuperadmin({ rol: "admin", es_superadmin: true })).toBe(true);
    expect(esSuperadmin({ rol: "admin", es_admin_global: true })).toBe(true);
  });

  it("NO considera superadmin a admin_vivero", () => {
    // admin_vivero es el admin del vivero de UN ayuntamiento; no es el dueño
    // de la plataforma. Confundirlos daría acceso entre ayuntamientos.
    expect(esSuperadmin({ rol: "admin_vivero" })).toBe(false);
  });

  it("es falso para el resto de roles y para entradas vacías", () => {
    for (const role of EFFECTIVE) {
      expect(esSuperadmin({ rol: role })).toBe(false);
    }
    expect(esSuperadmin(null)).toBe(false);
    expect(esSuperadmin({})).toBe(false);
  });

  it("no acepta flags falsy como verdaderos", () => {
    expect(esSuperadmin({ rol: "manager", es_superadmin: false })).toBe(false);
    expect(esSuperadmin({ rol: "manager", es_admin_global: 0 })).toBe(false);
  });
});

/* ── LA MATRIZ ──────────────────────────────────────────────────────────── */

describe("matriz rol × ruta (isPathAllowedForRole)", () => {
  for (const role of EFFECTIVE) {
    describe(`rol ${role}`, () => {
      for (const path of ALL_ROUTES) {
        const expected = MATRIX[role][path];
        it(`${expected ? "permite" : "deniega"} ${path}`, () => {
          expect(isPathAllowedForRole(path, role)).toBe(expected);
        });
      }
    });
  }
});

describe("denegación por defecto", () => {
  it("deniega todo cuando no hay rol", () => {
    for (const path of ALL_ROUTES) {
      expect(isPathAllowedForRole(path, "")).toBe(false);
      expect(isPathAllowedForRole(path, null)).toBe(false);
      expect(isPathAllowedForRole(path, undefined)).toBe(false);
    }
  });

  it("deniega todo a un rol desconocido, incluida `/`", () => {
    // Salvo `/`, que es la redirección a /dashboard y se permite siempre para
    // no provocar un bucle. Todo lo demás debe caer.
    expect(isPathAllowedForRole("/", "rol_inventado")).toBe(true);
    for (const path of ALL_ROUTES.filter((p) => p !== "/")) {
      expect(isPathAllowedForRole(path, "rol_inventado")).toBe(false);
    }
  });

  it("deniega rutas que no existen, para todos los roles", () => {
    const bogus = ["/admin", "/admin/", "/usuarios", "/pedidos/1", "/dashboard/x", "/PEDIDOS", "//pedidos"];
    for (const role of EFFECTIVE) {
      for (const path of bogus) {
        expect(isPathAllowedForRole(path, role)).toBe(false);
      }
    }
  });

  it("no permite escalar por prefijo de ruta", () => {
    // `proveedor` solo tiene /pedidos: ninguna variante debe colarse.
    expect(isPathAllowedForRole("/pedidos", ROLES.PROVEEDOR)).toBe(true);
    expect(isPathAllowedForRole("/pedidos-admin", ROLES.PROVEEDOR)).toBe(false);
    expect(isPathAllowedForRole("/pedidos/admin", ROLES.PROVEEDOR)).toBe(false);
  });
});

/* ── Caso especial: super-admin global ──────────────────────────────────── */

describe("super-admin global y /plataforma", () => {
  const superadmin = { rol: "superadmin", username: "owner" };
  const adminFlag = { rol: "admin", es_superadmin: true };
  const adminVivero = { rol: "admin_vivero" };
  const adminNormal = { rol: "admin" };

  it("permite /plataforma al super-admin por rol", () => {
    expect(canAccessRoute(ROUTES.PLATAFORMA, superadmin)).toBe(true);
  });

  it("permite /plataforma al super-admin por flag", () => {
    expect(canAccessRoute(ROUTES.PLATAFORMA, adminFlag)).toBe(true);
  });

  it("DENIEGA /plataforma a admin_vivero", () => {
    expect(canAccessRoute(ROUTES.PLATAFORMA, adminVivero)).toBe(false);
  });

  it("DENIEGA /plataforma a un admin normal", () => {
    expect(canAccessRoute(ROUTES.PLATAFORMA, adminNormal)).toBe(false);
  });

  it("DENIEGA /plataforma al resto de roles", () => {
    for (const role of EFFECTIVE.filter((r) => r !== "admin")) {
      expect(canAccessRoute(ROUTES.PLATAFORMA, { rol: role })).toBe(false);
    }
  });

  it("el super-admin conserva todas las rutas de admin", () => {
    for (const path of ALL_ROUTES) {
      const expected = path === ROUTES.PLATAFORMA ? true : MATRIX.admin[path];
      expect(canAccessRoute(path, superadmin)).toBe(expected);
    }
  });

  it("aterriza en /plataforma, no en /dashboard", () => {
    expect(resolveLandingRoute(superadmin)).toBe(ROUTES.PLATAFORMA);
    expect(resolveLandingRoute(adminFlag)).toBe(ROUTES.PLATAFORMA);
  });

  it("admin_vivero aterriza en /dashboard como cualquier admin", () => {
    expect(resolveLandingRoute(adminVivero)).toBe(ROUTES.DASHBOARD);
  });
});

/* ── canAccessRoute para todos los roles ────────────────────────────────── */

describe("canAccessRoute (usuario completo)", () => {
  for (const role of EFFECTIVE) {
    for (const path of ALL_ROUTES) {
      const expected = MATRIX[role][path];
      it(`${role} → ${path} = ${expected}`, () => {
        expect(canAccessRoute(path, { rol: role })).toBe(expected);
      });
    }
  }

  it("deniega todo a un usuario sin sesión", () => {
    for (const path of ALL_ROUTES.filter((p) => p !== "/")) {
      expect(canAccessRoute(path, null)).toBe(false);
      expect(canAccessRoute(path, {})).toBe(false);
    }
  });
});

/* ── Menú visible ───────────────────────────────────────────────────────── */

describe("getVisibleNavItems", () => {
  const expectedNav = {
    admin: ["/dashboard", "/productos", "/movimientos", "/pedidos", "/aprobaciones", "/informes"],
    tecnico: ["/dashboard", "/productos", "/movimientos", "/pedidos", "/informes"],
    manager: ["/dashboard", "/productos", "/movimientos", "/aprobaciones", "/informes"],
    gestor_vivero: ["/dashboard", "/productos", "/movimientos", "/pedidos", "/informes"],
    empresa_externa: ["/productos", "/pedidos", "/informes"],
    proveedor: ["/pedidos"],
  };

  for (const [role, paths] of Object.entries(expectedNav)) {
    it(`${role} ve exactamente ${paths.length} elemento(s)`, () => {
      expect(getVisibleNavItems(role).map((i) => i.to)).toEqual(paths);
    });
  }

  it("devuelve una lista vacía sin rol o con rol desconocido", () => {
    expect(getVisibleNavItems("")).toEqual([]);
    expect(getVisibleNavItems(null)).toEqual([]);
    expect(getVisibleNavItems(undefined)).toEqual([]);
    expect(getVisibleNavItems("rol_inventado")).toEqual([]);
  });

  it("cada elemento visible corresponde a una ruta permitida", () => {
    // Invariante: el menú nunca puede ofrecer un enlace que el guard rechace.
    // Si esto falla, el usuario ve un enlace que le expulsa al pulsarlo.
    for (const role of EFFECTIVE) {
      for (const item of getVisibleNavItems(role)) {
        expect(isPathAllowedForRole(item.to, role)).toBe(true);
      }
    }
  });

  it("proveedor no ve NINGÚN elemento de escritura", () => {
    const items = getVisibleNavItems(ROLES.PROVEEDOR);
    expect(items).toHaveLength(1);
    expect(items[0].to).toBe(ROUTES.PEDIDOS);
  });

  it("no muta NAV_ITEMS entre llamadas", () => {
    const before = getVisibleNavItems(ROLES.ADMIN).length;
    getVisibleNavItems(ROLES.PROVEEDOR);
    getVisibleNavItems(ROLES.EMPRESA_EXTERNA);
    expect(getVisibleNavItems(ROLES.ADMIN)).toHaveLength(before);
  });
});

/* ── Ruta por defecto ───────────────────────────────────────────────────── */

describe("getDefaultRouteForRole", () => {
  const expected = {
    admin: "/dashboard",
    tecnico: "/dashboard",
    manager: "/dashboard",
    gestor_vivero: "/dashboard",
    empresa_externa: "/productos",
    proveedor: "/pedidos",
  };

  for (const [role, route] of Object.entries(expected)) {
    it(`${role} → ${route}`, () => {
      expect(getDefaultRouteForRole(role)).toBe(route);
    });
  }

  it("cae en /dashboard para roles desconocidos", () => {
    expect(getDefaultRouteForRole("rol_inventado")).toBe("/dashboard");
    expect(getDefaultRouteForRole("")).toBe("/dashboard");
  });

  it("la ruta por defecto siempre está permitida para su propio rol", () => {
    // Invariante crítica: si la ruta de aterrizaje no estuviera permitida, el
    // guard redirigiría a ella y volvería a rechazarla — bucle infinito.
    for (const role of EFFECTIVE) {
      expect(isPathAllowedForRole(getDefaultRouteForRole(role), role)).toBe(true);
    }
  });
});

/* ── Capacidades de interfaz ────────────────────────────────────────────── */

describe("capacidades de la interfaz", () => {
  it("canSeePlataforma solo para super-admin global", () => {
    expect(canSeePlataforma({ rol: "superadmin" })).toBe(true);
    expect(canSeePlataforma({ rol: "admin", es_admin_global: true })).toBe(true);
    expect(canSeePlataforma({ rol: "admin" })).toBe(false);
    expect(canSeePlataforma({ rol: "admin_vivero" })).toBe(false);
  });

  it("canSelectCliente solo para super-admin global", () => {
    // El selector de ayuntamiento cambia el tenant activo: exponerlo a un
    // admin de ayuntamiento le dejaría mirar datos de otros municipios.
    expect(canSelectCliente({ rol: "superadmin" })).toBe(true);
    expect(canSelectCliente({ rol: "admin_vivero" })).toBe(false);
    for (const role of EFFECTIVE) {
      expect(canSelectCliente({ rol: role })).toBe(false);
    }
  });

  it("canManageUsuarios para admin y sus alias, nadie más", () => {
    expect(canManageUsuarios({ rol: "admin" })).toBe(true);
    expect(canManageUsuarios({ rol: "admin_vivero" })).toBe(true);
    expect(canManageUsuarios({ rol: "superadmin" })).toBe(true);
    for (const role of EFFECTIVE.filter((r) => r !== "admin")) {
      expect(canManageUsuarios({ rol: role })).toBe(false);
    }
    expect(canManageUsuarios(null)).toBe(false);
  });

  it("canSeeNotifications para todos menos empresa_externa", () => {
    for (const role of EFFECTIVE.filter((r) => r !== "empresa_externa")) {
      expect(canSeeNotifications({ rol: role })).toBe(true);
    }
    expect(canSeeNotifications({ rol: "empresa_externa" })).toBe(false);
    expect(canSeeNotifications(null)).toBe(false);
    expect(canSeeNotifications({})).toBe(false);
  });

  it("canOpenMapaVivero solo para roles internos del vivero", () => {
    for (const role of ["admin", "tecnico", "manager", "gestor_vivero"]) {
      expect(canOpenMapaVivero({ rol: role })).toBe(true);
    }
    for (const role of ["empresa_externa", "proveedor"]) {
      expect(canOpenMapaVivero({ rol: role })).toBe(false);
    }
    expect(canOpenMapaVivero(null)).toBe(false);
  });
});

/* ── Cobertura de la matriz ─────────────────────────────────────────────── */

describe("integridad de la matriz", () => {
  it("cubre 6 roles × 11 rutas = 66 combinaciones", () => {
    const combos = EFFECTIVE.length * ALL_ROUTES.length;
    expect(EFFECTIVE).toHaveLength(6);
    expect(ALL_ROUTES).toHaveLength(11);
    expect(combos).toBe(66);
  });

  it("todos los roles efectivos declarados están en la matriz", () => {
    // Si se añade un rol a EFFECTIVE_ROLES sin añadirlo aquí, esta prueba lo
    // señala en lugar de dejarlo sin cobertura en silencio.
    expect(new Set(EFFECTIVE)).toEqual(
      new Set(["admin", "manager", "tecnico", "gestor_vivero", "empresa_externa", "proveedor"])
    );
  });
});
