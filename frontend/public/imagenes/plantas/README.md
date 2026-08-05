# Imágenes de plantas

Coloca aquí las fotos de las plantas. El botón **🖼️ Ver** aparece
automáticamente en la tabla de Productos y en el selector de producto del
modal de Movimientos **solo si existe** una imagen para esa planta.

## Convención de nombre

El nombre del fichero se deriva del **nombre científico** del producto,
normalizado a "slug":

- minúsculas
- sin tildes
- los espacios y cualquier carácter no alfanumérico → guion `-`

Extensiones admitidas (se prueban en este orden): `.jpg`, `.jpeg`, `.png`, `.webp`.

### Ejemplos

| Nombre científico       | Fichero                              |
| ----------------------- | ------------------------------------ |
| `Quercus ilex`          | `quercus-ilex.jpg`                   |
| `Phoenix canariensis`   | `phoenix-canariensis.png`            |
| `Pinus canariensis`     | `pinus-canariensis.jpg`              |
| `Dracaena draco`        | `dracaena-draco.webp`                |

La lógica de resolución del slug vive en
`frontend/src/utils/plantImages.js` (función `plantSlug`).
