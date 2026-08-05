// Resolución de imágenes de plantas alojadas por nombre en una carpeta estática.
//
// Convención: las imágenes viven en `public/imagenes/plantas/` y el nombre de
// fichero se deriva del nombre científico normalizado a un "slug":
//   "Quercus ilex"      → /imagenes/plantas/quercus-ilex.jpg
//   "Phoenix canariensis" → /imagenes/plantas/phoenix-canariensis.png
//
// Como es una carpeta estática no podemos listar su contenido desde el
// navegador, así que comprobamos la disponibilidad intentando cargar la
// imagen (probe). El resultado se cachea por slug para no repetir peticiones
// aunque el producto aparezca en muchas filas.

import { useEffect, useMemo, useState } from "react";

const BASE = "/imagenes/plantas/";
// Extensiones que se prueban, en orden. Nos quedamos con la primera que cargue.
// Las fotos reales (jpg/png) tienen prioridad sobre los SVG de ejemplo.
const EXTS = ["jpg", "jpeg", "png", "webp", "svg"];

export function plantSlug(nombreCientifico) {
  return (nombreCientifico || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // todo lo no alfanumérico → guion
    .replace(/^-+|-+$/g, ""); // sin guiones sobrantes en los extremos
}

const cache = new Map(); // slug -> Promise<string|null>

function probe(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Devuelve una promesa con la URL de la imagen disponible, o null si no existe.
export function resolvePlantImage(nombreCientifico) {
  const slug = plantSlug(nombreCientifico);
  if (!slug) return Promise.resolve(null);
  if (cache.has(slug)) return cache.get(slug);
  const p = (async () => {
    for (const ext of EXTS) {
      const url = `${BASE}${slug}.${ext}`;
      // eslint-disable-next-line no-await-in-loop
      if (await probe(url)) return url;
    }
    return null;
  })();
  cache.set(slug, p);
  return p;
}

// Hook: devuelve la URL de la imagen si está disponible, o null (mientras
// carga o si no existe). Usar para decidir si se muestra el botón "Ver".
export function usePlantImage(nombreCientifico) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    resolvePlantImage(nombreCientifico).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [nombreCientifico]);
  return url;
}

// Hook: dada una lista de productos, sondea sus imágenes (reutilizando la
// caché) y devuelve un Set con los ids de los que SÍ tienen imagen. El Set se
// va rellenando a medida que cada probe resuelve, así el filtro reacciona en
// cuanto hay resultados sin esperar a sondear todo el catálogo.
export function usePlantsWithImage(productos) {
  const lista = Array.isArray(productos) ? productos : [];
  const sig = useMemo(
    () => lista.map((p) => `${p.id}:${p.nombre_cientifico || ""}`).join("|"),
    [lista]
  );
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => {
    let active = true;
    setIds(new Set());
    lista.forEach((p) => {
      resolvePlantImage(p.nombre_cientifico).then((url) => {
        if (active && url) {
          setIds((prev) => {
            if (prev.has(p.id)) return prev;
            const next = new Set(prev);
            next.add(p.id);
            return next;
          });
        }
      });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return ids;
}
