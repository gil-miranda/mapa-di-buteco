function normalizar(t) {
  return t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

let allData = [];
let map = L.map("map").setView([-22.9068, -43.1729], 11);
let markers = L.layerGroup().addTo(map);
let userLocationMarker = null; // marcador de geolocalização atual

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Validates that a URL uses http or https and returns it, or returns empty string. */
function safeURL(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") ? url : "";
  } catch {
    return "";
  }
}

function carregarDados() {
  Papa.parse("data/comida_di_buteco_rj_2026.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      const csvRows = results.data || [];

      // Também carrega o JSON original para buscar prato e foto
      fetch("data/comida_di_buteco_rj_2026.json")
        .then(r => r.json())
        .then(jsonData => {
          const extrasByName = {};
          jsonData.forEach(item => {
            const key = normalizar(item.name);
            extrasByName[key] = {
              dish: item.dish_name || "",
              image: item.dish_image_url || ""
            };
          });

          allData = csvRows
            .map(item => {
              const key = normalizar(item.name);
              const extra = extrasByName[key] || {};
              const lat = parseFloat(item.lat);
              const lng = parseFloat(item.lng);
              return {
                name: item.name,
                address: item.address || "",
                bairro: item.bairro || "",
                link: item.link || "",
                lat: Number.isFinite(lat) ? lat : null,
                lng: Number.isFinite(lng) ? lng : null,
                dish: extra.dish,
                image: extra.image
              };
            })
            .filter(l => l.name && l.address);

          gerarBreadcrumb(allData);
          renderizar(allData, document.getElementById("search").value);
        })
        .catch(() => {
          // fallback sem prato/foto
          allData = csvRows
            .map(item => {
              const lat = parseFloat(item.lat);
              const lng = parseFloat(item.lng);
              return {
                name: item.name,
                address: item.address || "",
                bairro: item.bairro || "",
                link: item.link || "",
                lat: Number.isFinite(lat) ? lat : null,
                lng: Number.isFinite(lng) ? lng : null,
              };
            })
            .filter((l) => l.name && l.address);

          gerarBreadcrumb(allData);
          renderizar(allData, document.getElementById("search").value);
        });
    },
    error: function (err) {
      console.error("Falha ao carregar CSV de bares:", err);
      const contador = document.getElementById("contador");
      if (contador) {
        const isFile = window.location && window.location.protocol === "file:";
        contador.textContent = isFile
          ? "⚠️ Não foi possível carregar o CSV. Abra este site via um servidor (ex: GitHub Pages ou `python -m http.server`) em vez de `file://`."
          : "⚠️ Não foi possível carregar os dados dos bares (veja o console).";
      }
    },
  });
}

function buildCard(l) {
  const el = document.createElement("div");
  el.className = "card";

  const h2 = document.createElement("h2");
  h2.textContent = l.name;
  el.appendChild(h2);

  const addrP = document.createElement("p");
  addrP.textContent = l.address;
  el.appendChild(addrP);

  const bairroSmall = document.createElement("small");
  const bairroStrong = document.createElement("strong");
  bairroStrong.textContent = "Bairro:";
  bairroSmall.appendChild(bairroStrong);
  bairroSmall.append(` ${l.bairro}`);
  el.appendChild(bairroSmall);
  el.appendChild(document.createElement("br"));

  if (l.dish) {
    const dishP = document.createElement("p");
    const dishStrong = document.createElement("strong");
    dishStrong.textContent = "Prato:";
    dishP.appendChild(dishStrong);
    dishP.append(` ${l.dish}`);
    el.appendChild(dishP);
  }

  if (typeof l.distanceKm === "number") {
    const distSmall = document.createElement("small");
    const distStrong = document.createElement("strong");
    distStrong.textContent = "Distância:";
    distSmall.appendChild(distStrong);
    distSmall.append(` ${l.distanceKm.toFixed(1)} km`);
    el.appendChild(distSmall);
    el.appendChild(document.createElement("br"));
  }

  const safeLink = safeURL(l.link);
  if (safeLink) {
    const a = document.createElement("a");
    a.href = safeLink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Ver no site oficial";
    el.appendChild(a);
  }

  if (l.image) {
    const safeImg = safeURL(l.image);
    if (safeImg) {
      const img = document.createElement("img");
      img.src = safeImg;
      img.alt = `Prato de ${l.name}`;
      img.loading = "lazy";
      el.appendChild(img);
    }
  }

  return el;
}

function buildPopup(l) {
  const div = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = l.name;
  div.appendChild(strong);
  div.appendChild(document.createElement("br"));
  div.append(l.address);
  const safeLink = safeURL(l.link);
  if (safeLink) {
    div.appendChild(document.createElement("br"));
    const a = document.createElement("a");
    a.href = safeLink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Ver no site";
    div.appendChild(a);
  }
  return div;
}

function renderizar(data, filtro) {
  const cards = document.getElementById("cards");
  const contador = document.getElementById("contador");
  const termo = normalizar(filtro);
  const filtrados = data.filter(l => {
    const alvo =
      normalizar(l.bairro) +
      " " +
      normalizar(l.name) +
      " " +
      normalizar(l.address);
    return alvo.includes(termo);
  });
  contador.textContent = `🔎 ${filtrados.length} bares encontrados`;
  cards.innerHTML = "";
  markers.clearLayers();

  const points = [];

  filtrados.forEach(l => {
    cards.appendChild(buildCard(l));

    if (Number.isFinite(l.lat) && Number.isFinite(l.lng)) {
      const m = L.marker([l.lat, l.lng]).bindPopup(buildPopup(l));
      markers.addLayer(m);
      points.push([l.lat, l.lng]);
    }
  });

  if (points.length) {
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.1));
  }
}

function gerarBreadcrumb(data) {
  const wrap = document.getElementById("breadcrumb");
  wrap.innerHTML = "";
  const bairros = [...new Set(data.map(l => l.bairro).filter(Boolean))].sort((a, b) => normalizar(a).localeCompare(normalizar(b)));
  bairros.forEach(b => {
    const btn = document.createElement("button");
    btn.textContent = b;
    btn.addEventListener("click", () => {
      document.getElementById("search").value = b;
      renderizar(allData, b);
      marcarAtivo(b);
    });
    wrap.appendChild(btn);
  });
}

function marcarAtivo(bairro) {
  document.querySelectorAll("#breadcrumb button").forEach(b => {
    b.classList.toggle("active", b.textContent === bairro);
  });
}

document.getElementById("search").addEventListener("input", e => {
  renderizar(allData, e.target.value);
  marcarAtivo(e.target.value);
});

async function encontrarMaisProximos() {
  const addressInput = document.getElementById("address");
  const contador = document.getElementById("contador");
  if (!addressInput) return;
  const raw = addressInput.value.trim();
  if (!raw) {
    renderizar(allData, document.getElementById("search").value);
    return;
  }

  try {
    const query =
      raw.toLowerCase().includes("rio de janeiro") || raw.toLowerCase().includes("rj")
        ? raw
        : `${raw}, Rio de Janeiro, RJ`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        query
      )}`
    );
    if (!res.ok) throw new Error("geocode_fail");
    const data = await res.json();
    if (!data || !data.length) throw new Error("no_results");
    const latUser = parseFloat(data[0].lat);
    const lngUser = parseFloat(data[0].lon);
    if (!Number.isFinite(latUser) || !Number.isFinite(lngUser)) {
      throw new Error("invalid_coords");
    }

    const withDistance = allData
      .filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng))
      .map(b => {
        const d = haversineKm(latUser, lngUser, b.lat, b.lng);
        return { ...b, distanceKm: d };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 20);

    if (!withDistance.length) {
      contador.textContent = "⚠️ Não há bares com coordenadas para calcular a distância.";
      return;
    }

    contador.textContent = `📍 Mostrando os ${withDistance.length} bares mais próximos de: ${raw}`;
    renderizar(withDistance, "");
  } catch (e) {
    contador.textContent =
      "⚠️ Não foi possível localizar este endereço. Tente ser mais específico (rua, bairro, cidade).";
  }
}

document.getElementById("nearby-btn").addEventListener("click", encontrarMaisProximos);
document.getElementById("nearby-geoloc-btn").addEventListener("click", encontrarPorLocalizacao);

const addressInputEl = document.getElementById("address");
if (addressInputEl) {
  addressInputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      encontrarMaisProximos();
    }
  });
}

function encontrarPorLocalizacao() {
  const contador = document.getElementById("contador");
  if (!navigator.geolocation) {
    contador.textContent = "⚠️ Geolocalização não é suportada pelo seu navegador.";
    return;
  }

  contador.textContent = "⏳ Obtendo localização do dispositivo...";

  if (navigator.permissions) {
    navigator.permissions.query({ name: "geolocation" }).then(status => {
      if (status.state === "denied") {
        contador.textContent = "⚠️ Permissão de geolocalização já foi negada no dispositivo. Verifique as configurações do Safari.";
      }
    });
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const latUser = position.coords.latitude;
      const lngUser = position.coords.longitude;

      const withDistance = allData
        .filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng))
        .map(b => {
          const d = haversineKm(latUser, lngUser, b.lat, b.lng);
          return { ...b, distanceKm: d };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 20);

      if (!withDistance.length) {
        contador.textContent = "⚠️ Não há bares com coordenadas para calcular a distância.";
        return;
      }

      contador.textContent = `📍 Mostrando ${withDistance.length} bares mais próximos da sua localização.`;
      renderizar(withDistance, "");

      // remove marcador antigo se existir
      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
        userLocationMarker = null;
      }

      // cria marcador vermelho para localização atual
      userLocationMarker = L.circleMarker([latUser, lngUser], {
        radius: 10,
        color: "red",
        fillColor: "red",
        fillOpacity: 0.8,
        weight: 2,
      })
        .bindPopup("Você está aqui")
        .addTo(map)
        .openPopup();

      map.setView([latUser, lngUser], 13);
    },
    error => {
      let msg = "⚠️ Não foi possível obter sua localização.";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          msg = "⚠️ Permissão de geolocalização negada. Por favor permita o acesso e tente novamente.";
          break;
        case error.POSITION_UNAVAILABLE:
          msg = "⚠️ Localização indisponível no momento.";
          break;
        case error.TIMEOUT:
          msg = "⚠️ O tempo de resposta da localização expirou. Tente novamente.";
          break;
      }
      contador.textContent = msg;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// Tema claro/escuro simples usando classe no body
const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  const saved = localStorage.getItem("theme") || "light";
  if (saved === "dark") {
    document.body.classList.add("dark");
    themeBtn.textContent = "☀️";
  }

  themeBtn.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    themeBtn.textContent = isDark ? "☀️" : "🌙";
  });
}

carregarDados();
