# Mapa del vivero — comportamiento antes de la migración

Inventario del grupo completo sobre `main@27523fb`, **antes** de tocar la
presentación. Son cuatro ficheros acoplados por la misma configuración de
zonas, y por eso se migran juntos.

| Fichero | Papel |
|---|---|
| `components/shell/ZonaMapDialog.jsx` | Mapa **en uso**, abierto desde el shell |
| `components/vivero/MapaVivero.jsx` | Mapa de `ViveroPage`, con subida de plano |
| `components/vivero/MapaVivero.css` | Estilos compartidos por ambos mapas y el editor |
| `components/vivero/ZoneEditor.jsx` | Editor de polígonos, usado por los dos |
| `components/vivero/zonasConfig.js` | Defaults «de fábrica» de las 19 zonas |
| `components/vivero/zonesStorage.js` | Carga/persistencia contra el servidor |

## 1. Dos superficies, un editor — y un interruptor distinto en cada una

```
ZonaMapDialog.jsx   ENABLE_ZONE_EDITOR = true    ← el editor SÍ es alcanzable
MapaVivero.jsx      ENABLE_ZONE_EDITOR = false   ← «cinturón de seguridad»
```

Ambos exigen además rol de administrador (`canEdit = ENABLE_ZONE_EDITOR &&
isAdmin`). El comentario de `MapaVivero` dice que el `false` es deliberado.

**Estos dos interruptores NO se tocan.** Cambiar cualquiera de los dos alteraría
qué puede hacer un usuario, que es exactamente lo que esta migración no debe
hacer.

## 2. Colores de zona: son DATOS, no estilo

Cada zona lleva su `color` en la configuración, se persiste en el servidor
(`zona_polygons`) y el administrador puede cambiarlo con un selector de color en
el editor.

Los 17 hexadecimales de `zonasConfig.js` son los **valores por defecto de esos
datos**, no decisiones de estilo de la aplicación. Convertirlos en tokens haría
dos daños: perdería la correspondencia con el plano impreso que maneja el
personal del vivero, y dejaría el selector de color del editor sin nada
coherente que producir.

**Se quedan como están, y se documenta por qué.** Lo que sí se tokeniza es todo
lo que rodea al mapa: contenedores, paneles, tipografía, focos y estados.

## 3. Identificación de zona contra el backend

`resolveZoneApiId(zone)` en `ZonaMapDialog` es la pieza más delicada del grupo.
La configuración guardada en el servidor puede traer ids corruptos (una celda
«3b» guardada como `zona-3`), así que resuelve contra la config canónica por
**cuatro vías, en orden de fiabilidad**:

1. **Por geometría** — los puntos del polígono coinciden con los canónicos.
   Funciona aunque el id y el nombre estén corruptos.
2. **Por nombre canónico** normalizado.
3. **Por id o apiId** canónico, tolerante al prefijo `zona`.
4. **Fallback** — quitar el prefijo `zona-` del apiId o del id.

La normalización imita a `_normalize_zona_id` del backend: minúsculas, sin
tildes, sin separadores, y quita el prefijo `zona` (incluso duplicado,
`zonazona`).

**El orden es el contrato.** Invertir 1 y 3 haría que una celda con el id
corrupto consultara el inventario de OTRA zona.

## 4. ZoneEditor — las seis ramas de `handleAddZona`

Es el punto de más riesgo del grupo: un `window.prompt` seguido de cuatro
`window.alert`.

Normalización de lo tecleado:

```
cleaned = raw.trim().toLowerCase().replace(/\s+/g, "")
apiId   = cleaned.replace(/^zona[-_]?/i, "")
fullId  = `zona-${apiId}`
```

Ramas, **en este orden**:

| # | Condición | Resultado |
|---|---|---|
| 1 | `raw === null` (cancelar) | Sale en silencio, sin aviso |
| 2 | `cleaned` vacío | «Identificador vacío. Operación cancelada.» |
| 3 | `apiId` vacío tras quitar el prefijo | «Identificador inválido. Operación cancelada.» |
| 4 | Ya existe una zona con ese `fullId` | «Ya existe una zona con id "…".» |
| 5 | `apiId` no casa `/^[a-z0-9-]+$/` | «solo puede contener letras (a-z), números y guiones.» |
| 6 | Todo correcto | Crea la zona, la selecciona |

**El orden de 4 y 5 importa** y se conserva: un identificador que sea a la vez
duplicado y con caracteres inválidos avisa de que **ya existe**, no de que sea
inválido. Invertirlos cambia el mensaje que ve el usuario.

La rama 3 se dispara con `"zona"`, `"zona-"` o `"zona_"` a secas.

La normalización del prefijo existe por un defecto real ya corregido: sin ella,
teclear `"zona9b"` creaba `"zona-zona9b"`, con prefijo doble.

Zona nueva: `nombre = "Zona {apiId}"`, color **aleatorio** de una paleta de 15,
y un cuadrado de 150×150 en el centro del plano.

## 5. ZoneEditor — resto de operaciones

| Acción | Regla |
|---|---|
| Eliminar zona | `window.confirm` con un aviso largo; sólo tras aceptar se quita de la lista. Reselecciona la primera restante, o `null` si no queda ninguna |
| Restaurar zona | Vuelve a los puntos ORIGINALES de esa zona (los recibidos por props), no a los de fábrica |
| Borrar vértice | Click derecho. **No baja de 3 vértices** (`MIN_VERTICES`) |
| Insertar vértice | Click en el punto medio de una arista; inserta el punto medio |
| Arrastrar vértice | Sólo botón izquierdo |
| Mover zona entera | Arrastrar el cuerpo, sólo si la zona está seleccionada |
| Escape | Cancela la edición completa |
| Guardar | Convierte `_points` a cadena redondeando a enteros |

Nada se persiste hasta «Guardar cambios»: el borrado de una zona tampoco.

## 6. Persistencia

`saveZonasToServer` normaliza el payload: `apiId` cae a `api_id` o al `id`, y el
color a `#cccccc` si falta. `loadZonasFromServer` cae a `zonasConfig.js` si el
servidor falla **o devuelve lista vacía**.

## 7. Permisos

| Acción | Quién |
|---|---|
| Ver el mapa y el inventario | Cualquiera con acceso a la pantalla |
| Editar zonas | `admin`, `admin_vivero` — y sólo si el interruptor está activo |
| Marcar zona como interna | `admin` (`isAdmin` en `ZonaMapDialog`) |
| Subir/cambiar el plano | `admin`, `admin_vivero`, `manager` (`MapaVivero`) |

## 8. Estado de la interfaz antes de migrar

- **Los polígonos del mapa no son alcanzables por teclado** en ninguna de las
  dos superficies: son `<polygon onClick>` sin `tabIndex`, sin rol y sin
  manejador de teclado.
- En `ZonaMapDialog` los polígonos **no tienen `<title>`**, así que no tienen
  nombre accesible. En `MapaVivero` sí.
- La zona seleccionada se distingue **sólo por color** (relleno y borde cian).
- El editor completo es **sólo ratón**: arrastre de vértices, click derecho para
  borrar, sin alternativa de teclado.
- El modal de zona de `MapaVivero` es un `div position:fixed` hecho a mano: sin
  trampa de foco, sin Escape y sin devolución del foco.
- Deuda visual del grupo: 85 (ZonaMapDialog) + 68 (MapaVivero.css) + 28
  (ZoneEditor) + 24 (MapaVivero.jsx) + 17 (zonasConfig) + 1 (zonesStorage).
- Diálogos nativos: 6 en ZoneEditor, 1 en MapaVivero, 1 en ZonaMapDialog.
