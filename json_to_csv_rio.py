import csv
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List


ROOT = Path(__file__).parent
# Usar o JSON já enriquecido com lat/lng que o site 2026 consome
INPUT_JSON = ROOT / "docs" / "data" / "comida_di_buteco_rj_2026.json"
OUTPUT_CSV = ROOT / "docs" / "data" / "comida_di_buteco_rj_2026.csv"


V1_ALIASES = {
  "bairro": "neighborhood_or_region",
  "link": "source_url",
}


def _stringify(value: Any) -> str:
  if value is None:
    return ""
  if isinstance(value, (dict, list)):
    return json.dumps(value, ensure_ascii=False)
  return str(value)


def build_fieldnames(items: List[Dict[str, Any]]) -> List[str]:
  keys = sorted({k for it in items for k in it.keys()})
  preferred = [
    "name",
    "neighborhood_or_region",
    "address",
    "address_complement",
    "phone",
    "opening_hours",
    "dish_name",
    "dish_description",
    "dish_image_url",
    "source_url",
    "listing_page",
    "lat",
    "lng",
  ]

  ordered: List[str] = []
  for k in preferred:
    if k in keys:
      ordered.append(k)
  for k in keys:
    if k not in ordered:
      ordered.append(k)

  # Campos extras compatíveis com o script v1 (não existem no JSON original)
  for extra in ("bairro", "link"):
    if extra not in ordered:
      ordered.append(extra)

  return ordered


def iter_rows(items: Iterable[Dict[str, Any]], fieldnames: List[str]):
  for item in items:
    row: Dict[str, str] = {}
    for field in fieldnames:
      if field in V1_ALIASES:
        row[field] = _stringify(item.get(V1_ALIASES[field]))
      else:
        row[field] = _stringify(item.get(field))
    yield row


def main() -> None:
  with INPUT_JSON.open("r", encoding="utf-8") as f:
    items: List[Dict[str, Any]] = json.load(f)

  OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)

  fieldnames = build_fieldnames(items)
  with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for row in iter_rows(items, fieldnames):
      writer.writerow(row)

  print(f"CSV salvo em {OUTPUT_CSV} com {len(items)} linhas.")


if __name__ == "__main__":
  main()

