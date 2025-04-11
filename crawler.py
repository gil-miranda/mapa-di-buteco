import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import os

CIDADES = [
    "belem", "belo-horizonte", "blumenau", "brasilia-butecos", "campinas", "curitiba-butecos", "florianopolis",
    "fortaleza", "goias", "joinville", "juiz-de-fora", "londrina", "manaus-butecos", "maringa", "montes-claros",
    "niteroi", "nova-iguacu-duque-de-caxias", "pocos-de-caldas", "porto-alegre", "recife", "ribeirao-preto",
    "rio-de-janeiro", "salvador", "sao-jose-do-rio-preto", "sao-paulo", "triangulo-mineiro", "vale-do-aco"
]

HEADERS = {'User-Agent': 'ComidaDiButecoCrawler/1.0'}

def geocode_address(address):
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {'q': address, 'format': 'json', 'addressdetails': 1}
        r = requests.get(url, params=params, headers=HEADERS, timeout=10)
        data = r.json()
        if data:
            result = data[0]
            lat = result['lat']
            lon = result['lon']
            bairro = result['address'].get('suburb') or result['address'].get('neighbourhood') or result['address'].get('city_district')
            return bairro, lat, lon
    except Exception:
        pass
    return None, None, None

def extract_data_from_city(city_slug):
    print(f"📍 Coletando bares de {city_slug}")
    base_url = f"https://comidadibuteco.com.br/butecos/{city_slug}/page/"
    page = 1
    bares = []

    while True:
        url = f"{base_url}{page}/"
        print(f"  → Página {page}")
        r = requests.get(url, headers=HEADERS)
        if r.status_code != 200:
            break

        soup = BeautifulSoup(r.text, "html.parser")
        captions = soup.find_all("div", class_="caption")
        if not captions:
            break

        for caption in captions:
            name_tag = caption.find("h2")
            address_tag = caption.find("p")
            link_tag = caption.find("a", string="Detalhes")

            if not name_tag or not address_tag:
                continue

            name = name_tag.text.strip()
            address = address_tag.text.strip()
            link = link_tag['href'] if link_tag else None

            bairro = None
            if "|" in address:
                try:
                    bairro = address.split("|")[1].split(",")[0].strip()
                except IndexError:
                    bairro = None

            if not bairro or bairro.lower() in ["rio de janeiro - rj", ""]:
                bairro, lat, lon = geocode_address(address)
            else:
                lat, lon = geocode_address(address)[1:]

            bares.append({
                "name": name,
                "address": address,
                "bairro": bairro,
                "link": link,
                "lat": lat,
                "lng": lon
            })

            time.sleep(1)  # respeitar rate limit do Nominatim

        page += 1

    df = pd.DataFrame(bares)
    out_dir = os.path.join("docs", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{city_slug}.csv")
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"✔️  {len(df)} bares salvos em {out_path}\n")

if __name__ == "__main__":
    for cidade in CIDADES:
        extract_data_from_city(cidade)
