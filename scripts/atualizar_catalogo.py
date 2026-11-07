
#!/usr/bin/env python3
"""Atualiza o catálogo usando as pastas com index.html."""

import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]

known = {
    "meu-curriculo": (
        "MEU CURRÍCULO", "Carreira", "📄",
        "Crie currículos profissionais."
    ),
    "meu-orcamento": (
        "MEU ORÇAMENTO", "Gestão", "🧾",
        "Prepare propostas e orçamentos."
    ),
    "meu-pdf": (
        "MEU PDF", "Documentos", "📑",
        "Organize e trabalhe com arquivos PDF."
    ),
    "meu-documento": (
        "MEU DOCUMENTO", "Documentos", "📁",
        "Crie e organize documentos."
    ),
    "meu-negocio": (
        "MEU NEGÓCIO", "Gestão", "🏢",
        "Organize informações da empresa."
    )
}

apps = []

for folder in sorted(root.iterdir()):
    if not folder.is_dir():
        continue

    if not re.fullmatch(r"meu-[a-z0-9-]+", folder.name):
        continue

    page = folder / "index.html"

    if not page.is_file() or page.stat().st_size < 100:
        continue

    name, category, icon, desc = known.get(
        folder.name,
        (
            folder.name.replace("-", " ").upper(),
            "Gestão",
            "🗂️",
            "Ferramenta do Business Pro."
        )
    )

    apps.append({
        "slug": folder.name,
        "name": name,
        "category": category,
        "icon": icon,
        "desc": desc,
        "ready": True
    })

(root / "catalogo.json").write_text(
    json.dumps({"apps": apps}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)

print(f"Catálogo gerado: {len(apps)} aplicativos")
