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
  /*
   * Se guarda el NOMBRE junto a la URL, y la URL efectiva se deriva al pintar.
   *
   * Antes el efecto hacía `setUrl(null)` antes de pedir la imagen, para que al
   * cambiar de planta no se viera un instante la foto de la anterior. Eso es un
   * `setState` en cascada en cada cambio; guardando a qué planta pertenece lo
   * resuelto, la foto vieja se descarta al comparar, sin repintar de más.
   */
  const [resuelto, setResuelto] = useState({ nombre: null, url: null });
  const url = resuelto.nombre === nombreCientifico ? resuelto.url : null;

  useEffect(() => {
    let active = true;
    resolvePlantImage(nombreCientifico).then((u) => {
      if (active) setResuelto({ nombre: nombreCientifico, url: u });
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
  /*
   * `lista` se memoiza: sin esto, el `[]` del caso «no es un array» se crea
   * nuevo en cada render y arrastra consigo a `sig` y al efecto que depende de
   * él, que acabaría sondeando el catálogo entero una y otra vez.
   */
  const lista = useMemo(() => (Array.isArray(productos) ? productos : []), [productos]);
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
    /*
     * Se depende de `sig`, no de `lista`. Es deliberado: `sig` es la firma de
     * id y nombre científico del catálogo, que es LO ÚNICO de lo que depende el
     * sondeo. `lista` cambia de identidad en cada recarga aunque traiga los
     * mismos productos, y volver a sondear el catálogo entero por eso sería
     * visible: el filtro se vaciaría y se volvería a llenar.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se depende de la firma del catálogo, no de la identidad de `lista`, que cambia en cada recarga
  }, [sig]);
  return ids;
}
