import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


HEADERS = {
    # Ajuste o user-agent/email se quiser algo mais específico
    "User-Agent": "ComidaDiButecoRJ-Geocoder/1.0 (+https://github.com/SEU_USUARIO)"
}

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """Consulta o Nominatim e retorna (lat, lon) para um endereço bruto."""
    try:
        params = {
            "q": address,
            "format": "json",
            "limit": 1,
            "addressdetails": 0,
        }
        resp = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        item = data[0]
        lat = float(item["lat"])
        lon = float(item["lon"])
        return lat, lon
    except (requests.RequestException, ValueError, KeyError) as e:
        logging.warning("Geocoding failed for %r: %s", address, e)
        return None


def enrich_butecos_with_coords(
    in_path: str,
    out_path: str,
    delay_seconds: float = 1.0,
) -> None:
    """Lê o JSON de bares, geocodifica endereços que ainda não têm lat/lng e grava um novo JSON."""
    with open(in_path, "r", encoding="utf-8") as f:
        items: List[Dict[str, Any]] = json.load(f)

    total = len(items)
    print(f"📍 Enriquecendo {total} bares com coordenadas (lat/lng)")

    for idx, item in enumerate(items, start=1):
        # Se já tiver lat/lng, pula
        if "lat" in item and "lng" in item and item["lat"] and item["lng"]:
            print(f"[{idx}/{total}] {item['name']}: lat/lng já presente, pulando.")
            continue

        address = item.get("address") or ""
        if not address:
            print(f"[{idx}/{total}] {item.get('name','<sem nome>')}: sem endereço, não geocodificado.")
            continue

        # Força o contexto de cidade/estado se não estiver muito claro
        if "Rio de Janeiro" not in address:
            address_query = f"{address}, Rio de Janeiro, Brasil"
        else:
            address_query = address

        print(f"[{idx}/{total}] Geocodificando: {item['name']} -> {address_query!r}")
        coords = geocode_address(address_query)
        if coords is None:
            print(f"   ⚠️  Não foi possível geocodificar.")
        else:
            lat, lon = coords
            item["lat"] = lat
            item["lng"] = lon
            print(f"   ✔️  lat={lat:.6f}, lng={lon:.6f}")

        # Respeitar rate limit do Nominatim
        time.sleep(delay_seconds)

    out_dir = os.path.dirname(out_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    print(f"\n✅ JSON enriquecido salvo em: {out_path}")


if __name__ == "__main__":
    # Arquivo original (sem lat/lng), na raiz do repositório
    INPUT_JSON = "comida_di_buteco_rj.json"

    # Saída pensada para ser lida diretamente pelo site estático
    OUTPUT_JSON = os.path.join("docs", "data", "comida_di_buteco_rj_2026.json")

    enrich_butecos_with_coords(INPUT_JSON, OUTPUT_JSON)

