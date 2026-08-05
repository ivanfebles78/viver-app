"""
Fusiona la guía principal con el anexo, preservando las imágenes y
estilos de ambos documentos.
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).parent
MAIN = HERE / "Guia_Usuario_ViverApp.docx"
ADDENDUM = HERE / "Addendum_Gestion_Usuarios.docx"
OUT = HERE / "Guia_Usuario_ViverApp_actualizada.docx"

from docx import Document
from docxcompose.composer import Composer

print(f"Cargando guía principal: {MAIN}")
master = Document(str(MAIN))

print(f"Cargando anexo: {ADDENDUM}")
addendum = Document(str(ADDENDUM))

print("Fusionando…")
composer = Composer(master)
composer.append(addendum)

composer.save(str(OUT))
size_mb = OUT.stat().st_size / (1024 * 1024)
print(f"✓ Fichero combinado: {OUT}")
print(f"  Tamaño: {size_mb:.1f} MB")
