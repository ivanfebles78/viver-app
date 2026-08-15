/**
 * Pruebas de contrato del cliente HTTP.
 *
 * Lo que se verifica aquí no es "que la petición funcione", sino que TODA
 * llamada arrastre la sesión y el ayuntamiento activo. Una llamada que se
 * escapa del interceptor no falla de forma visible: devuelve datos —
 * potencialmente de otro ayuntamiento — o un 401 que nadie gestiona. Ese fue
 * exactamente el fallo de `Lotetracking.jsx`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Se intercepta la capa de adaptador de axios en lugar de simular el módulo
// entero: así se ejercita el interceptor real, que es justamente lo que se
// quiere comprobar.
const requests = [];

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal();
  const create = (config) => {
    const instance = actual.default.create(config);
    instance.defaults.adapter = async (requestConfig) => {
      requests.push(requestConfig);
      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config: requestConfig,
      };
    };
    return instance;
  };
  return { ...actual, default: { ...actual.default, create } };
});

const { getLote, getProductos, setStoredToken, setActiveClienteId, clearStoredToken } =
  await import("./api");

/** Última petición emitida, normalizando el acceso a cabeceras de axios. */
function lastRequest() {
  const config = requests[requests.length - 1];
  const headers = config.headers;
  return {
    url: config.url,
    method: config.method,
    get: (name) => (typeof headers?.get === "function" ? headers.get(name) : headers?.[name]),
  };
}

describe("interceptor de peticiones", () => {
  beforeEach(() => {
    requests.length = 0;
    window.localStorage.clear();
  });

  it("añade Authorization cuando hay token", async () => {
    setStoredToken("jwt-de-prueba");
    await getProductos();
    expect(lastRequest().get("Authorization")).toBe("Bearer jwt-de-prueba");
  });

  it("no añade Authorization cuando no hay token", async () => {
    await getProductos();
    expect(lastRequest().get("Authorization")).toBeFalsy();
  });

  it("añade X-Cliente-Id cuando hay ayuntamiento activo", async () => {
    setStoredToken("jwt");
    setActiveClienteId(7);
    await getProductos();
    expect(lastRequest().get("X-Cliente-Id")).toBe("7");
  });

  it("omite X-Cliente-Id cuando no hay ayuntamiento activo", async () => {
    setStoredToken("jwt");
    await getProductos();
    expect(lastRequest().get("X-Cliente-Id")).toBeFalsy();
  });

  it("clearStoredToken olvida también el ayuntamiento activo", async () => {
    setStoredToken("jwt");
    setActiveClienteId(3);
    clearStoredToken();
    await getProductos();
    const req = lastRequest();
    expect(req.get("Authorization")).toBeFalsy();
    expect(req.get("X-Cliente-Id")).toBeFalsy();
  });
});

describe("getLote — regresión de Lotetracking", () => {
  beforeEach(() => {
    requests.length = 0;
    window.localStorage.clear();
  });

  it("viaja con la sesión y el ayuntamiento activo", async () => {
    // La regresión concreta: la pantalla llamaba a `axios.get()` crudo y perdía
    // ambas cabeceras. Si alguien vuelve a hacerlo, esta prueba lo detecta.
    setStoredToken("jwt-lote");
    setActiveClienteId(42);

    await getLote("abc-123");

    const req = lastRequest();
    expect(req.get("Authorization")).toBe("Bearer jwt-lote");
    expect(req.get("X-Cliente-Id")).toBe("42");
  });

  it("usa la ruta /lotes/:uuid", async () => {
    setStoredToken("jwt");
    await getLote("abc-123");
    expect(lastRequest().url).toBe("/lotes/abc-123");
  });

  it("codifica un UUID con caracteres que reescribirían la ruta", async () => {
    setStoredToken("jwt");
    await getLote("../admin/usuarios");
    expect(lastRequest().url).not.toContain("../");
    expect(lastRequest().url).toBe("/lotes/..%2Fadmin%2Fusuarios");
  });

  it("recorta espacios alrededor del UUID pegado", async () => {
    setStoredToken("jwt");
    await getLote("  abc-123  ");
    expect(lastRequest().url).toBe("/lotes/abc-123");
  });
});

describe("ninguna pantalla usa axios crudo", () => {
  it("solo api.js importa axios directamente", async () => {
    // Barrera arquitectónica: cualquier otro import de axios se salta el
    // interceptor y, con él, la sesión y el aislamiento por ayuntamiento.
    const { readdirSync, readFileSync, statSync, existsSync } = await import("node:fs");
    const { join, relative, resolve } = await import("node:path");

    // Se resuelve desde el directorio de trabajo de vitest (la raíz del
    // frontend) en lugar de desde `import.meta.url`: bajo el transformador de
    // vitest esa URL no siempre tiene esquema `file:`, y en Windows su
    // `.pathname` trae un "/" delante de la letra de unidad.
    const root = resolve(process.cwd(), "src");
    expect(existsSync(root), `no se encontró el directorio src en ${root}`).toBe(true);
    const offenders = [];

    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(js|jsx)$/.test(entry)) continue;
        const rel = relative(root, full).replace(/\\/g, "/");
        if (rel === "api/api.js" || rel.endsWith(".test.js") || rel.endsWith(".test.jsx")) continue;
        if (/^\s*import\s+.*\bfrom\s+["']axios["']/m.test(readFileSync(full, "utf8"))) {
          offenders.push(rel);
        }
      }
    };

    walk(root);
    expect(offenders).toEqual([]);
  });
});
