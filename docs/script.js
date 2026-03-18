function normalizar(t) {
  return t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

let allData = [];
let map = L.map("map").setView([-22.9068, -43.1729], 11);
let markers = L.layerGroup().addTo(map);
let userLocationMarker = null;

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeURL(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") ? url : "";
  } catch {
    return "";
  }
}

/**
 * Extracts the dish name from raw data.
 * The CSV's dish_name is often "-"; the real name is embedded in dish_description
 * after the pattern "Santander [BarName] [DishName] [DishDescription]".
 */
function extractDishName(barName, rawDishName, description) {
  if (rawDishName && rawDishName.trim() && rawDishName.trim() !== "-") {
    return rawDishName.trim();
  }
  if (!description || !barName) return "";

  const anchor = "Santander " + barName;
  const idx = description.indexOf(anchor);
  if (idx === -1) return "";

  const text = description.slice(idx + anchor.length).trimStart();

  // Pattern 1: dish name ends with ! or ? (e.g. "Que delícia de rabada!")
  const exclamMatch = text.match(/^([^.]{3,80}[!?])\s/);
  if (exclamMatch) return exclamMatch[1].trim();

  // Pattern 2: before "Uma " or "Um " article that starts food description
  const umaMatch = text.match(/^(.{2,80}?)\s+[Uu]m[a]?\s/);
  if (umaMatch) return umaMatch[1].trim().replace(/[,;]$/, "");

  // Pattern 3: before "[CapitalWord] [preposition/participle]" food description
  const prepMatch = text.match(
    /^(.{2,60}?)\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕ]\w+ (?:de|ao|da|do|com|em|na|no|à|recheada?s?|assada?s?|servida?s?|grelhada?s?|finalizada?s?|frita?s?)\s/
  );
  if (prepMatch) return prepMatch[1].trim().replace(/[,;]$/, "");

  // Fallback: first 4 words
  return text.split(/\s+/).slice(0, 4).join(" ").replace(/[,;.!?]$/, "");
}

function parseOpeningHours(raw) {
  if (!raw || raw === "-") return "";
  // Compact multi-day ranges: "Ter–Dom: 12h–23h"
  return raw
    .replace(/Terça-feira/g, "Ter")
    .replace(/Quarta-feira/g, "Qua")
    .replace(/Quinta-feira/g, "Qui")
    .replace(/Sexta-feira/g, "Sex")
    .replace(/Sábado/g, "Sáb")
    .replace(/Domingo/g, "Dom")
    .replace(/Segunda-feira/g, "Seg")
    .split(" | ")
    .join(" · ");
}

function setStatus(html) {
  const el = document.getElementById("contador");
  if (el) el.innerHTML = html;
}

function carregarDados() {
  setStatus('<span class="spinner"></span> Carregando bares…');
  Papa.parse("data/comida_di_buteco_rj_2026.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      allData = parseCSVRows(results.data || []);
      gerarBreadcrumb(allData);
      renderizar(allData, document.getElementById("search").value);
    },
    error: function (err) {
      console.error("Falha ao carregar CSV:", err);
      const isFile = window.location.protocol === "file:";
      setStatus(isFile
        ? "⚠️ Abra via servidor (GitHub Pages ou <code>python -m http.server</code>), não via file://."
        : "⚠️ Não foi possível carregar os dados. Verifique o console.");
    },
  });
}

function parseCSVRows(csvRows) {
  return csvRows
    .map(item => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lng);
      const dishName = extractDishName(item.name, item.dish_name, item.dish_description);
      return {
        name: item.name || "",
        address: item.address || "",
        bairro: item.bairro || item.neighborhood_or_region || "",
        link: item.link || item.source_url || "",
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        dish: dishName,
        image: item.dish_image_url || "",
        hours: parseOpeningHours(item.opening_hours || ""),
        phone: (item.phone || "").trim(),
      };
    })
    .filter(l => l.name && l.address);
}

function buildCard(l) {
  const el = document.createElement("div");
  el.className = "card";

  // Dish image at top
  const safeImg = safeURL(l.image);
  if (safeImg) {
    const wrap = document.createElement("div");
    wrap.className = "card-img-wrap";
    const img = document.createElement("img");
    img.src = safeImg;
    img.alt = l.dish ? `Prato: ${l.dish}` : `Foto do prato de ${l.name}`;
    img.loading = "lazy";
    wrap.appendChild(img);
    el.appendChild(wrap);
  }

  const body = document.createElement("div");
  body.className = "card-body";

  const h2 = document.createElement("h2");
  h2.textContent = l.name;
  body.appendChild(h2);

  if (l.dish) {
    const badge = document.createElement("span");
    badge.className = "dish-badge";
    badge.textContent = `🍽️ ${l.dish}`;
    body.appendChild(badge);
  }

  const addrP = document.createElement("p");
  addrP.className = "card-address";
  addrP.textContent = l.address;
  body.appendChild(addrP);

  const tags = document.createElement("div");
  tags.className = "card-tags";

  if (l.bairro) {
    const bairroTag = document.createElement("span");
    bairroTag.className = "tag";
    bairroTag.textContent = `📍 ${l.bairro}`;
    tags.appendChild(bairroTag);
  }

  if (typeof l.distanceKm === "number") {
    const distTag = document.createElement("span");
    distTag.className = "tag distance-tag";
    distTag.textContent = `${l.distanceKm.toFixed(1)} km`;
    tags.appendChild(distTag);
  }

  body.appendChild(tags);

  if (l.hours) {
    const hoursP = document.createElement("p");
    hoursP.className = "card-hours";
    hoursP.textContent = `🕐 ${l.hours}`;
    body.appendChild(hoursP);
  }

  const footer = document.createElement("div");
  footer.className = "card-footer";

  if (l.phone) {
    const tel = document.createElement("a");
    tel.href = `tel:+55${l.phone.replace(/\D/g, "")}`;
    tel.className = "card-phone";
    tel.textContent = `📞 ${l.phone}`;
    footer.appendChild(tel);
  }

  const safeLink = safeURL(l.link);
  if (safeLink) {
    const a = document.createElement("a");
    a.href = safeLink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "card-link";
    a.textContent = "Ver no site →";
    footer.appendChild(a);
  }

  if (footer.children.length) body.appendChild(footer);
  el.appendChild(body);
  return el;
}

function buildPopup(l) {
  const div = document.createElement("div");
  div.className = "map-popup";

  const strong = document.createElement("strong");
  strong.textContent = l.name;
  div.appendChild(strong);

  if (l.dish) {
    const dishP = document.createElement("p");
    dishP.className = "popup-dish";
    dishP.textContent = `🍽️ ${l.dish}`;
    div.appendChild(dishP);
  }

  const addrP = document.createElement("p");
  addrP.textContent = l.address;
  div.appendChild(addrP);

  const safeLink = safeURL(l.link);
  if (safeLink) {
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
  const termo = normalizar(filtro);

  const filtrados = data.filter(l => {
    const alvo = [
      normalizar(l.name),
      normalizar(l.bairro),
      normalizar(l.address),
      normalizar(l.dish),
    ].join(" ");
    return alvo.includes(termo);
  });

  const count = filtrados.length;
  setStatus(`🔎 ${count} bar${count !== 1 ? "es" : ""} encontrado${count !== 1 ? "s" : ""}`);
  cards.innerHTML = "";
  markers.clearLayers();

  if (!filtrados.length) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.innerHTML = "<span>🔍</span><p>Nenhum bar encontrado para esta busca.</p>";
    cards.appendChild(empty);
    return;
  }

  const points = [];
  filtrados.forEach(l => {
    cards.appendChild(buildCard(l));
    if (Number.isFinite(l.lat) && Number.isFinite(l.lng)) {
      markers.addLayer(L.marker([l.lat, l.lng]).bindPopup(buildPopup(l)));
      points.push([l.lat, l.lng]);
    }
  });

  if (points.length) {
    map.fitBounds(L.latLngBounds(points).pad(0.1));
  }
}

function gerarBreadcrumb(data) {
  const wrap = document.getElementById("breadcrumb");
  wrap.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.textContent = "Todos";
  allBtn.className = "active";
  allBtn.addEventListener("click", () => {
    document.getElementById("search").value = "";
    renderizar(allData, "");
    marcarAtivo(null);
  });
  wrap.appendChild(allBtn);

  const bairros = [...new Set(data.map(l => l.bairro).filter(Boolean))].sort(
    (a, b) => normalizar(a).localeCompare(normalizar(b))
  );
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
  document.querySelectorAll("#breadcrumb button").forEach(btn => {
    if (bairro === null) {
      btn.classList.toggle("active", btn.textContent === "Todos");
    } else {
      btn.classList.toggle("active", btn.textContent === bairro);
    }
  });
}

document.getElementById("search").addEventListener("input", e => {
  renderizar(allData, e.target.value);
  marcarAtivo(null);
});

async function encontrarMaisProximos() {
  const addressInput = document.getElementById("address");
  if (!addressInput) return;
  const raw = addressInput.value.trim();
  if (!raw) {
    renderizar(allData, document.getElementById("search").value);
    return;
  }

  setStatus('<span class="spinner"></span> Buscando localização…');

  try {
    const query = raw.toLowerCase().includes("rio de janeiro") || raw.toLowerCase().includes("rj")
      ? raw
      : `${raw}, Rio de Janeiro, RJ`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error("geocode_fail");
    const data = await res.json();
    if (!data || !data.length) throw new Error("no_results");
    const latUser = parseFloat(data[0].lat);
    const lngUser = parseFloat(data[0].lon);
    if (!Number.isFinite(latUser) || !Number.isFinite(lngUser)) throw new Error("invalid_coords");

    const withDistance = allData
      .filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng))
      .map(b => ({ ...b, distanceKm: haversineKm(latUser, lngUser, b.lat, b.lng) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 20);

    if (!withDistance.length) {
      setStatus("⚠️ Nenhum bar tem coordenadas para calcular distância.");
      return;
    }

    setStatus(`📍 ${withDistance.length} bares mais próximos de: <strong>${raw}</strong>`);
    renderizar(withDistance, "");
  } catch {
    setStatus("⚠️ Não foi possível localizar este endereço. Tente ser mais específico (rua, bairro).");
  }
}

document.getElementById("nearby-btn").addEventListener("click", encontrarMaisProximos);
document.getElementById("nearby-geoloc-btn").addEventListener("click", encontrarPorLocalizacao);

const addressInputEl = document.getElementById("address");
if (addressInputEl) {
  addressInputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); encontrarMaisProximos(); }
  });
}

function encontrarPorLocalizacao() {
  if (!navigator.geolocation) {
    setStatus("⚠️ Geolocalização não suportada pelo seu navegador.");
    return;
  }

  setStatus('<span class="spinner"></span> Obtendo sua localização…');

  if (navigator.permissions) {
    navigator.permissions.query({ name: "geolocation" }).then(status => {
      if (status.state === "denied") {
        setStatus("⚠️ Permissão de geolocalização negada. Verifique as configurações do navegador.");
      }
    });
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude: latUser, longitude: lngUser } = position.coords;
      const withDistance = allData
        .filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng))
        .map(b => ({ ...b, distanceKm: haversineKm(latUser, lngUser, b.lat, b.lng) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 20);

      if (!withDistance.length) {
        setStatus("⚠️ Nenhum bar tem coordenadas para calcular distância.");
        return;
      }

      setStatus(`📍 ${withDistance.length} bares mais próximos da sua localização`);
      renderizar(withDistance, "");

      if (userLocationMarker) { map.removeLayer(userLocationMarker); }
      userLocationMarker = L.circleMarker([latUser, lngUser], {
        radius: 10, color: "#e11d48", fillColor: "#e11d48", fillOpacity: 0.85, weight: 2,
      }).bindPopup("📍 Você está aqui").addTo(map).openPopup();
      map.setView([latUser, lngUser], 13);
    },
    error => {
      const msgs = {
        [error.PERMISSION_DENIED]: "⚠️ Permissão negada. Permita o acesso à localização e tente novamente.",
        [error.POSITION_UNAVAILABLE]: "⚠️ Localização indisponível no momento.",
        [error.TIMEOUT]: "⚠️ Tempo de resposta expirou. Tente novamente.",
      };
      setStatus(msgs[error.code] || "⚠️ Não foi possível obter sua localização.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// Theme toggle
const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  const saved = localStorage.getItem("theme") || "light";
  if (saved === "dark") { document.body.classList.add("dark"); themeBtn.textContent = "☀️"; }
  themeBtn.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    themeBtn.textContent = isDark ? "☀️" : "🌙";
  });
}

carregarDados();
