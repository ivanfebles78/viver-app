/**
 * PRUEBA DE EQUIVALENCIA — el modelo nuevo se comporta igual que el viejo.
 *
 * `permissions.test.js` comprueba que el modelo hace lo que creemos que debe
 * hacer. Esta prueba comprueba algo distinto y más estricto: que hace
 * exactamente lo que hacía `Layout.jsx` en `main`, incluidos los casos que
 * nadie documentó y que quizá nadie recuerda.
 *
 * Las funciones de abajo son una COPIA LITERAL de
 * `frontend/src/layout/Layout.jsx@main`, líneas 169–293, extraídas con
 * `git show main:...`. No se han reordenado ni simplificado: cualquier
 * "limpieza" aquí destruiría el valor de la prueba, porque estaríamos
 * comparando el modelo nuevo con nuestra idea del viejo en lugar de con el
 * viejo.
 *
 * La comparación es exhaustiva sobre el producto cartesiano rol × ruta,
 * incluidos roles inválidos y rutas inexistentes.
 */

import { describe, it, expect } from "vitest";
import {
  getVisibleNavItems as newGetVisibleNavItems,
  getDefaultRouteForRole as newGetDefaultRouteForRole,
  isPathAllowedForRole as newIsPathAllowedForRole,
} from "./permissions";

/* ══════════════════════════════════════════════════════════════════════════
   COPIA LITERAL DE Layout.jsx@main — NO EDITAR
   ══════════════════════════════════════════════════════════════════════════ */

const LEGACY_NAV_ITEMS = [
  { to: "/dashboard", label: "Panel de control" },
  { to: "/productos", label: "Productos" },
  { to: "/movimientos", label: "Movimientos" },
  { to: "/pedidos", label: "Pedidos" },
  { to: "/aprobaciones", label: "Aprobaciones" },
  { to: "/informes", label: "Informes" },
];

function legacyGetVisibleNavItems(role) {
  if (!role) return [];

  if (role === "admin") {
    return LEGACY_NAV_ITEMS;
  }

  if (role === "tecnico") {
    return LEGACY_NAV_ITEMS.filter((i) =>
      ["/dashboard", "/productos", "/movimientos", "/pedidos", "/informes"].includes(i.to)
    );
  }

  if (role === "manager") {
    return LEGACY_NAV_ITEMS.filter((i) =>
      ["/dashboard", "/productos", "/movimientos", "/aprobaciones", "/informes"].includes(i.to)
    );
  }

  if (role === "gestor_vivero") {
    return LEGACY_NAV_ITEMS.filter((i) =>
      ["/dashboard", "/productos", "/movimientos", "/pedidos", "/informes"].includes(i.to)
    );
  }

  if (role === "empresa_externa") {
    return LEGACY_NAV_ITEMS.filter((i) =>
      ["/productos", "/pedidos", "/informes"].includes(i.to)
    );
  }

  // Proveedor: rol de SOLO CONSULTA. Únicamente ve los pedidos de
  // reposición aprobados y puede imprimirlos. Nada más en el menú.
  if (role === "proveedor") {
    return LEGACY_NAV_ITEMS.filter((i) => i.to === "/pedidos");
  }

  return [];
}

function legacyGetDefaultRouteForRole(role) {
  if (role === "admin") return "/dashboard";
  if (role === "tecnico") return "/dashboard";
  if (role === "manager") return "/dashboard";
  if (role === "gestor_vivero") return "/dashboard";
  if (role === "empresa_externa") return "/productos";
  if (role === "proveedor") return "/pedidos";
  return "/dashboard";
}

function legacyIsPathAllowedForRole(pathname, role) {
  if (!role) return false;

  if (pathname === "/") return true;

  if (role === "admin") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/pedidos",
      "/aprobaciones",
      "/informes",
      "/lotes",
      "/vivero",
      "/admin/usuarios",
    ].includes(pathname);
  }

  if (role === "tecnico") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/pedidos",
      "/informes",
      "/lotes",
      "/vivero",
    ].includes(pathname);
  }

  if (role === "manager") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/aprobaciones",
      "/informes",
      "/lotes",
      "/vivero",
    ].includes(pathname);
  }

  if (role === "gestor_vivero") {
    return [
      "/dashboard",
      "/productos",
      "/movimientos",
      "/pedidos",
      "/informes",
      "/lotes",
      "/vivero",
    ].includes(pathname);
  }

  if (role === "empresa_externa") {
    return ["/productos", "/pedidos", "/informes"].includes(pathname);
  }

  // Proveedor: solo /pedidos.
  if (role === "proveedor") {
    return pathname === "/pedidos";
  }

  return false;
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPARACIÓN EXHAUSTIVA
   ══════════════════════════════════════════════════════════════════════════ */

/** Roles reales, alias, valores límite y basura deliberada. */
const ROLE_INPUTS = [
  "admin",
  "manager",
  "tecnico",
  "gestor_vivero",
  "empresa_externa",
  "proveedor",
  "superadmin",
  "admin_vivero",
  "",
  null,
  undefined,
  "ADMIN",
  " admin ",
  "rol_inventado",
  "administrador",
  "admin ",
];

/** Rutas reales, variantes de mayúsculas, prefijos y rutas inexistentes. */
const PATH_INPUTS = [
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
  "/login",
  "/admin",
  "/admin/",
  "/usuarios",
  "/pedidos/",
  "/pedidos/1",
  "/PEDIDOS",
  "//pedidos",
  "/dashboard/x",
  "/pedidos-admin",
  "",
  "dashboard",
];

describe("equivalencia con Layout.jsx@main", () => {
  it(`isPathAllowedForRole coincide en las ${ROLE_INPUTS.length * PATH_INPUTS.length} combinaciones`, () => {
    const divergences = [];
    for (const role of ROLE_INPUTS) {
      for (const path of PATH_INPUTS) {
        const before = legacyIsPathAllowedForRole(path, role);
        const after = newIsPathAllowedForRole(path, role);
        if (before !== after) {
          divergences.push(`role=${JSON.stringify(role)} path=${JSON.stringify(path)}: antes=${before} ahora=${after}`);
        }
      }
    }
    expect(divergences).toEqual([]);
  });

  it("getDefaultRouteForRole coincide para toda entrada", () => {
    const divergences = [];
    for (const role of ROLE_INPUTS) {
      const before = legacyGetDefaultRouteForRole(role);
      const after = newGetDefaultRouteForRole(role);
      if (before !== after) {
        divergences.push(`role=${JSON.stringify(role)}: antes=${before} ahora=${after}`);
      }
    }
    expect(divergences).toEqual([]);
  });

  it("getVisibleNavItems devuelve las mismas rutas, en el mismo orden", () => {
    const divergences = [];
    for (const role of ROLE_INPUTS) {
      const before = legacyGetVisibleNavItems(role).map((i) => i.to);
      const after = newGetVisibleNavItems(role).map((i) => i.to);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        divergences.push(`role=${JSON.stringify(role)}: antes=${JSON.stringify(before)} ahora=${JSON.stringify(after)}`);
      }
    }
    expect(divergences).toEqual([]);
  });

  it("getVisibleNavItems devuelve también las mismas etiquetas", () => {
    // Las etiquetas son visibles para el usuario; un cambio silencioso aquí
    // sería un cambio de producto disfrazado de refactor.
    for (const role of ROLE_INPUTS) {
      expect(newGetVisibleNavItems(role).map((i) => i.label)).toEqual(
        legacyGetVisibleNavItems(role).map((i) => i.label)
      );
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   PRUEBAS DE MUTACIÓN — ¿detectaría la matriz un debilitamiento real?
   ══════════════════════════════════════════════════════════════════════════

   Una matriz de permisos que pasa siempre no prueba nada. Aquí se aplican
   mutaciones deliberadas al modelo (versiones debilitadas de las mismas
   funciones) y se exige que la comparación con el legado las DETECTE.

   Si alguna de estas mutaciones pasara desapercibida, significaría que la
   comparación de arriba tiene un agujero.
   ══════════════════════════════════════════════════════════════════════════ */

/** Aplica la comparación exhaustiva a una implementación candidata. */
function findDivergences(candidateIsPathAllowed) {
  const divergences = [];
  for (const role of ROLE_INPUTS) {
    for (const path of PATH_INPUTS) {
      if (legacyIsPathAllowedForRole(path, role) !== candidateIsPathAllowed(path, role)) {
        divergences.push(`${role}:${path}`);
      }
    }
  }
  return divergences;
}

describe("pruebas de mutación", () => {
  it("detecta una lista de permitidos convertida en denegados (fail-open)", () => {
    const mutant = (pathname, role) => {
      if (!role) return false;
      if (pathname === "/") return true;
      // Mutación: "permite salvo que esté prohibido" en lugar de lo contrario.
      return !["/plataforma"].includes(pathname);
    };
    expect(findDivergences(mutant).length).toBeGreaterThan(0);
  });

  it("detecta que proveedor gane acceso a /productos", () => {
    const mutant = (pathname, role) => {
      if (role === "proveedor") return pathname === "/pedidos" || pathname === "/productos";
      return legacyIsPathAllowedForRole(pathname, role);
    };
    expect(findDivergences(mutant)).toContain("proveedor:/productos");
  });

  it("detecta que manager gane /pedidos", () => {
    const mutant = (pathname, role) => {
      if (role === "manager" && pathname === "/pedidos") return true;
      return legacyIsPathAllowedForRole(pathname, role);
    };
    expect(findDivergences(mutant)).toContain("manager:/pedidos");
  });

  it("detecta que tecnico gane /aprobaciones", () => {
    const mutant = (pathname, role) => {
      if (role === "tecnico" && pathname === "/aprobaciones") return true;
      return legacyIsPathAllowedForRole(pathname, role);
    };
    expect(findDivergences(mutant)).toContain("tecnico:/aprobaciones");
  });

  it("detecta que empresa_externa gane /admin/usuarios", () => {
    const mutant = (pathname, role) => {
      if (role === "empresa_externa" && pathname === "/admin/usuarios") return true;
      return legacyIsPathAllowedForRole(pathname, role);
    };
    expect(findDivergences(mutant)).toContain("empresa_externa:/admin/usuarios");
  });

  it("detecta una comprobación por prefijo en lugar de igualdad", () => {
    // El fallo clásico: startsWith() deja pasar /pedidos-admin y /pedidos/1.
    const mutant = (pathname, role) => {
      if (!role) return false;
      if (pathname === "/") return true;
      if (role === "proveedor") return String(pathname).startsWith("/pedidos");
      return legacyIsPathAllowedForRole(pathname, role);
    };
    const found = findDivergences(mutant);
    expect(found).toContain("proveedor:/pedidos-admin");
    expect(found).toContain("proveedor:/pedidos/1");
  });

  it("detecta que se acepte un rol vacío", () => {
    const mutant = (pathname, role) => {
      // Mutación: sin rol se trata como admin.
      if (!role) return legacyIsPathAllowedForRole(pathname, "admin");
      return legacyIsPathAllowedForRole(pathname, role);
    };
    expect(findDivergences(mutant).length).toBeGreaterThan(0);
  });

  it("detecta una comparación de rol insensible a mayúsculas", () => {
    // El legado compara en minúsculas exactas: "ADMIN" NO es admin. Si el
    // modelo nuevo normalizase aquí, concedería permisos que antes no daba.
    const mutant = (pathname, role) => {
      const r = String(role || "").toLowerCase();
      return legacyIsPathAllowedForRole(pathname, r);
    };
    expect(findDivergences(mutant)).toContain("ADMIN:/dashboard");
  });

  it("detecta que se pierda el permiso de `/` (bucle de redirección)", () => {
    const mutant = (pathname, role) => {
      if (pathname === "/") return false;
      return legacyIsPathAllowedForRole(pathname, role);
    };
    expect(findDivergences(mutant).length).toBeGreaterThan(0);
  });

  it("la implementación REAL no diverge en ninguna combinación", () => {
    // El control positivo: tras nueve mutaciones detectadas, la implementación
    // real debe seguir siendo idéntica al legado.
    expect(findDivergences(newIsPathAllowedForRole)).toEqual([]);
  });
});
