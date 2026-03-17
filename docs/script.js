function normalizar(t) {
  return t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

let allData = [];
let map = L.map("map").setView([-22.9068, -43.1729], 11);
let markers = L.layerGroup().addTo(map);

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
              return {
                name: item.name,
                address: item.address || "",
                bairro: item.bairro || "",
                link: item.link || "",
                lat: item.lat ? parseFloat(item.lat) : null,
                lng: item.lng ? parseFloat(item.lng) : null,
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
            .map(item => ({
              name: item.name,
              address: item.address || "",
              bairro: item.bairro || "",
              link: item.link || "",
              lat: item.lat ? parseFloat(item.lat) : null,
              lng: item.lng ? parseFloat(item.lng) : null,
            }))
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
    const el = document.createElement("div");
    el.className = "card";
    const dishLine = l.dish
      ? `<p><strong>Prato:</strong> ${l.dish}</p>`
      : "";
    const distanceLine =
      typeof l.distanceKm === "number"
        ? `<small><strong>Distância:</strong> ${l.distanceKm.toFixed(1)} km</small><br/>`
        : "";
    const imageBlock = l.image
      ? `<img src="${l.image}" alt="Prato de ${l.name}" loading="lazy" />`
      : "";
    el.innerHTML =
      `<h2>${l.name}</h2>` +
      `<p>${l.address}</p>` +
      `<small><strong>Bairro:</strong> ${l.bairro}</small><br/>` +
      dishLine +
      distanceLine +
      (l.link
        ? `<a href="${l.link}" target="_blank">Ver no site oficial</a>`
        : "") +
      imageBlock;
    cards.appendChild(el);
    if (l.lat && l.lng) {
      const lat = parseFloat(l.lat);
      const lng = parseFloat(l.lng);
      const m = L.marker([lat, lng])
        .bindPopup(`<strong>${l.name}</strong><br>${l.address}<br><a href="${l.link}" target="_blank">Ver no site</a>`);
      markers.addLayer(m);
      points.push([lat, lng]);
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
      .filter(b => b.lat && b.lng)
      .map(b => {
        const d = haversineKm(latUser, lngUser, parseFloat(b.lat), parseFloat(b.lng));
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

const addressInputEl = document.getElementById("address");
if (addressInputEl) {
  addressInputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      encontrarMaisProximos();
    }
  });
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
