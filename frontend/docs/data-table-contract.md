# Contrato de `DataTable` y su relación con los PDF

> Este documento existe por un riesgo concreto que la auditoría marcó como
> CRÍTICO. Léelo antes de migrar Informes o Pedidos.

## El riesgo

`pages/Informes.jsx` genera 17 tablas de PDF con `autoTable` de jspdf. Esas
llamadas **consumen los mismos arrays** que se renderizan en pantalla:

```js
const filas = useMemo(() => construirFilas(datos), [datos]);   // ← una sola fuente

<table>{filas.map(...)}</table>                                 // pantalla
autoTable(doc, { body: filas.map(f => [f.a, f.b, f.c]) });      // PDF
```

Migrar la tabla de pantalla a `DataTable` obliga a declarar `columns`. La
tentación natural es reordenar, renombrar o preformatear los campos para que
encajen mejor en la interfaz. Si se hace sobre el array compartido, **el PDF
cambia en silencio**: mismas cifras, otro orden de columnas, u otro formato.

Nadie se entera. El build pasa, las pruebas de interfaz pasan, y el defecto
aparece semanas después en un expediente impreso que ya se ha registrado.

## La regla

**Los datos que alimentan un PDF no se tocan al migrar la presentación.**

En concreto, al migrar una pantalla que exporte a PDF:

1. **No modificar** el `useMemo` que construye las filas. Ni el orden de las
   claves, ni sus nombres, ni el formato de sus valores.
2. `DataTable` recibe ese array **tal cual**. El formato para pantalla se hace
   en la función `cell` de cada columna, que es puramente presentacional y no
   altera el dato.
3. Si la interfaz necesita un orden de columnas distinto al del PDF, se cambia
   el orden de `columns` — nunca el del array de datos.
4. Antes y después de la migración: **generar el PDF y compararlo**. Es la
   única verificación que cubre el camino completo.

## Por qué el diseño de `columns` lo permite

```js
{ key: "cantidad", header: "Cantidad", numeric: true, cell: (fila) => formatear(fila.cantidad) }
```

`cell` recibe la fila entera y devuelve nodos de React. No transforma el dato de
origen: lee de él. Por eso una tabla puede presentar `cantidad` con separador de
miles mientras el PDF sigue recibiendo el número crudo — siempre que nadie
"mejore" el array compartido.

El orden visible lo fija el orden de `columns`, que es un array **aparte** del
de datos. Esa separación es la que hace segura la migración; perderla es lo que
la haría peligrosa.

## Verificación automática

`src/ui/contract.test.js` comprueba que:

- ninguna pantalla que importe `jspdf`/`autoTable` importe también `DataTable`
  sin que este documento esté referenciado en el fichero, y
- las columnas de las pantallas ya migradas declaran `key` estables.

Es una barrera deliberadamente tosca: no puede demostrar que un PDF no ha
cambiado. Lo que hace es **obligar a que quien migre una pantalla con PDF se
tope con esta regla** en lugar de descubrirla después.

La verificación de verdad es manual y está en el punto 4 de la regla.

## Estado actual

| Pantalla | PDF | Migrada a `DataTable` |
|---|---|---|
| AdminUsuarios | no | sí (piloto de la Fase 2) |
| Informes | **sí — 17 `autoTable`** | no — Fase 5 |
| Pedidos | **sí — renderizador propio** | no — Fase 4 |
| Productos, Movimientos, Aprobaciones, Plataforma | no | no |
