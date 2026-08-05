import pandas as pd
from db import SessionLocal
from models import Producto

EXCEL_PATH = "Inventario_v4.xlsx"
SHEET_NAME = "Resultado"

# Leer Excel
df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME)

# Quedarnos solo con las columnas necesarias
df = df[
    [
        "Nombre cientifico",
        "Nombre Comun",
        "Categoria",
        "Subcategoria",
    ]
].copy()

# Renombrar columnas
df.columns = [
    "nombre_cientifico",
    "nombre_natural",
    "categoria",
    "subcategoria",
]

# Limpiar espacios
for col in df.columns:
    df[col] = df[col].astype(str).str.strip()

# Reemplazar vacíos
df = df.replace({"nan": None, "": None})

# Eliminar filas sin nombre científico
df = df[df["nombre_cientifico"].notna()].copy()

db = SessionLocal()

insertados = 0
saltados = 0

for _, row in df.iterrows():
    try:
        existente = (
            db.query(Producto)
            .filter(Producto.nombre_cientifico == row["nombre_cientifico"])
            .first()
        )

        if existente:
            saltados += 1
            continue

        producto = Producto(
            nombre_natural=row["nombre_natural"],
            nombre_cientifico=row["nombre_cientifico"],
            categoria=row["categoria"],
            subcategoria=row["subcategoria"],
            stock_minimo=5,
        )

        db.add(producto)
        insertados += 1

    except Exception as e:
        print(f"Error en fila con nombre científico '{row.get('nombre_cientifico')}': {e}")
        saltados += 1

db.commit()
db.close()

print("IMPORTACIÓN COMPLETADA")
print(f"Insertados: {insertados}")
print(f"Saltados: {saltados}")