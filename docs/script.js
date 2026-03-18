/* ===================================================
   HELPERS
   =================================================== */
function normalizar(t) {
  return t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

/** Returns the URL if it uses http(s), otherwise empty string */
function safeURL(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") ? url : "";
  } catch {
    return "";
  }
}

/** Haversine distance in km */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract the actual dish description from the raw scraped text.
 * Many bars have boilerplate that starts with "Comida di Buteco …"
 * The real content appears after "Santander <bar_name>".
 */
function extractDishDescription(raw, barName) {
  if (!raw) return "";
  // Clean description — no boilerplate
  if (!raw.startsWith("Comida di Buteco")) return raw.trim();

  const marker = "Santander " + barName;
  const idx = raw.indexOf(marker);
  if (idx !== -1) {
    const after = raw.slice(idx + marker.length).trim();
    if (after.length > 20) return after;
  }
  // Fallback: try just after "Santander"
  const idx2 = raw.indexOf("Santander");
  if (idx2 !== -1) {
    const after = raw.slice(idx2 + "Santander".length).trim();
    if (after.length > 20) return after;
  }
  return "";
}

/**
 * Return today's opening hours string (e.g. "18h – 23h") or null.
 * openingHours format: "Segunda-feira: 18h – 23h | Terça-feira: 18h – 23h | …"
 */
function getTodayHours(openingHours) {
  if (!openingHours) return null;
  const dayNames = [
    "Domingo", "Segunda-feira", "Terça-feira",
    "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"
  ];
  const today = dayNames[new Date().getDay()];
  for (const part of openingHours.split("|")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(today)) {
      // "Terça-feira: 18h – 23h" → "18h – 23h"
      const colon = trimmed.indexOf(":");
      return colon !== -1 ? trimmed.slice(colon + 1).trim() : null;
    }
  }
  return null;
}

/**
 * Format a phone number for display: (21) 99439-0023
 */
function formatPhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  }
  return phone;
}

/* ===================================================
   STATE
   =================================================== */
let allData = [];
let activeBairro = null;

/* ===================================================
   MAP
   =================================================== */
const map = L.map("map").setView([-22.9068, -43.1729], 11);
const markers = L.layerGroup().addTo(map);
let userLocationMarker = null;

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);

/* ===================================================
   DATA LOADING
   =================================================== */
function carregarDados() {
  fetch("data/comida_di_buteco_rj_2026.json")
    .then(r => r.json())
    .then(jsonData => {
      allData = jsonData
        .map(item => {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lng);
          const rawDesc = item.dish_description || "";
          const dishDesc = extractDishDescription(rawDesc, item.name);
          return {
            name: item.name || "",
            address: item.address || "",
            bairro: item.bairro || item.neighborhood_or_region || "",
            link: safeURL(item.link || item.source_url || ""),
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            dish: (item.dish_name && item.dish_name !== "-") ? item.dish_name : "",
            dishDesc: dishDesc,
            image: safeURL(item.dish_image_url || ""),
            phone: item.phone || "",
            openingHours: item.opening_hours || "",
          };
        })
        .filter(l => l.name && l.address);

      renderStats(allData);
      gerarBreadcrumb(allData);
      renderizar(allData, "");

      // Show initially-hidden sections
      document.getElementById("stats-bar").hidden = false;
      document.getElementById("neighborhood-section").hidden = false;
    })
    .catch(err => {
      console.error("Falha ao carregar dados:", err);
      // Fallback: try CSV via PapaParse
      carregarCSV();
    });
}

function carregarCSV() {
  Papa.parse("data/comida_di_buteco_rj_2026.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      allData = (results.data || [])
        .map(item => {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lng);
          return {
            name: item.name || "",
            address: item.address || "",
            bairro: item.bairro || item.neighborhood_or_region || "",
            link: safeURL(item.link || item.source_url || ""),
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            dish: (item.dish_name && item.dish_name !== "-") ? item.dish_name : "",
            dishDesc: extractDishDescription(item.dish_description || "", item.name),
            image: safeURL(item.dish_image_url || ""),
            phone: item.phone || "",
            openingHours: item.opening_hours || "",
          };
        })
        .filter(l => l.name && l.address);

      renderStats(allData);
      gerarBreadcrumb(allData);
      renderizar(allData, "");
      document.getElementById("stats-bar").hidden = false;
      document.getElementById("neighborhood-section").hidden = false;
    },
    error: function (err) {
      console.error("Falha ao carregar CSV:", err);
      const contador = document.getElementById("contador");
      if (contador) {
        const isFile = window.location && window.location.protocol === "file:";
        contador.innerHTML = `<div class="message-box warning">
          ${isFile
            ? "⚠️ Abra este site via servidor (GitHub Pages ou <code>python -m http.server</code>) — não via <code>file://</code>."
            : "⚠️ Não foi possível carregar os dados. Tente recarregar a página."}
        </div>`;
      }
    }
  });
}

/* ===================================================
   STATS
   =================================================== */
function renderStats(data) {
  const neighborhoods = new Set(data.map(l => l.bairro).filter(Boolean)).size;
  const withPhotos = data.filter(l => l.image).length;
  document.getElementById("stat-bars").textContent = data.length;
  document.getElementById("stat-bairros").textContent = neighborhoods;
  document.getElementById("stat-photos").textContent = withPhotos;
}

/* ===================================================
   CARD BUILDER
   =================================================== */
function buildCard(l) {
  const el = document.createElement("article");
  el.className = "card";

  // Image
  if (l.image) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "card-image";
    const img = document.createElement("img");
    img.src = l.image;
    img.alt = l.dish ? `${l.dish} — ${l.name}` : `Prato de ${l.name}`;
    img.loading = "lazy";
    imgWrap.appendChild(img);
    el.appendChild(imgWrap);
  } else {
    el.classList.add("no-image");
  }

  const body = document.createElement("div");
  body.className = "card-body";

  // Title row (name + bairro badge)
  const top = document.createElement("div");
  top.className = "card-top";
  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = l.name;
  top.appendChild(title);
  if (l.bairro) {
    const badge = document.createElement("span");
    badge.className = "bairro-badge";
    badge.textContent = l.bairro;
    top.appendChild(badge);
  }
  body.appendChild(top);

  // Dish name
  if (l.dish) {
    const dishRow = document.createElement("div");
    dishRow.className = "card-dish";
    const label = document.createElement("span");
    label.className = "card-dish-label";
    label.textContent = "Prato";
    const name = document.createElement("span");
    name.className = "card-dish-name";
    name.textContent = l.dish;
    dishRow.appendChild(label);
    dishRow.appendChild(name);
    body.appendChild(dishRow);
  }

  // Dish description
  if (l.dishDesc) {
    const desc = document.createElement("p");
    desc.className = "card-desc";
    // If dish was "-" and desc starts with real dish name + description, show as-is
    desc.textContent = l.dishDesc;
    body.appendChild(desc);
  }

  // Meta: address + today's hours
  const meta = document.createElement("div");
  meta.className = "card-meta";

  const addrRow = document.createElement("div");
  addrRow.className = "card-meta-row";
  addrRow.innerHTML = `<span class="meta-icon">📍</span><span>${l.address}</span>`;
  meta.appendChild(addrRow);

  const todayHours = getTodayHours(l.openingHours);
  if (todayHours) {
    const hoursRow = document.createElement("div");
    hoursRow.className = "card-meta-row";
    const now = new Date();
    const isOpen = isOpenNow(l.openingHours);
    const statusClass = isOpen ? "hours-open" : "hours-closed";
    const statusLabel = isOpen ? "Aberto agora" : "Fechado agora";
    hoursRow.innerHTML = `<span class="meta-icon">🕐</span><span><span class="${statusClass}">${statusLabel}</span> · ${todayHours}</span>`;
    meta.appendChild(hoursRow);
  }

  body.appendChild(meta);

  // Footer: distance + actions
  const footer = document.createElement("div");
  footer.className = "card-footer";

  if (typeof l.distanceKm === "number") {
    const dist = document.createElement("span");
    dist.className = "card-distance";
    dist.textContent = `📏 ${l.distanceKm.toFixed(1)} km`;
    footer.appendChild(dist);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (l.phone) {
    const phoneLink = document.createElement("a");
    phoneLink.className = "card-btn card-btn-secondary";
    phoneLink.href = `tel:+55${l.phone.replace(/\D/g, "")}`;
    phoneLink.textContent = "📞 " + formatPhone(l.phone);
    phoneLink.setAttribute("aria-label", `Ligar para ${l.name}`);
    actions.appendChild(phoneLink);
  }

  if (l.link) {
    const siteLink = document.createElement("a");
    siteLink.className = "card-btn card-btn-primary";
    siteLink.href = l.link;
    siteLink.target = "_blank";
    siteLink.rel = "noopener noreferrer";
    siteLink.textContent = "Ver site →";
    actions.appendChild(siteLink);
  }

  footer.appendChild(actions);
  body.appendChild(footer);
  el.appendChild(body);
  return el;
}

/**
 * Rough check if bar is open right now based on opening_hours string.
 * Returns true/false or null if parsing fails.
 */
function isOpenNow(openingHours) {
  const todayStr = getTodayHours(openingHours);
  if (!todayStr) return null;
  // Match "18h – 23h" or "18:00 – 23h" etc.
  const match = todayStr.match(/(\d{1,2})(?::(\d{2}))?h?\s*[–\-]\s*(\d{1,2})(?::(\d{2}))?h?/);
  if (!match) return null;
  const openH = parseInt(match[1]), openM = parseInt(match[2] || "0");
  let closeH = parseInt(match[3]), closeM = parseInt(match[4] || "0");
  // Handle midnight wrap-around (e.g. 0h30 means next day 00:30)
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = openH * 60 + openM;
  let closeMins = closeH * 60 + closeM;
  if (closeMins <= openMins) closeMins += 24 * 60; // crosses midnight
  return nowMins >= openMins && nowMins < closeMins;
}

/* ===================================================
   MAP POPUP BUILDER
   =================================================== */
function buildPopup(l) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width: 230px; font-family: 'Segoe UI', system-ui, sans-serif;";

  if (l.image) {
    const img = document.createElement("img");
    img.src = l.image;
    img.alt = `Prato de ${l.name}`;
    img.loading = "lazy";
    img.style.cssText = "width:100%; height:110px; object-fit:cover; display:block; border-radius:6px 6px 0 0; margin:-12px -12px 10px; width: calc(100% + 24px);";
    wrap.appendChild(img);
  }

  const title = document.createElement("strong");
  title.style.cssText = "font-size: 0.9rem; display:block; margin-bottom:3px;";
  title.textContent = l.name;
  wrap.appendChild(title);

  if (l.bairro) {
    const badge = document.createElement("span");
    badge.style.cssText = "display:inline-block; padding:1px 8px; background:#fef3c7; color:#d97706; border-radius:999px; font-size:0.65rem; font-weight:700; margin-bottom:6px;";
    badge.textContent = l.bairro;
    wrap.appendChild(badge);
  }

  if (l.dish) {
    const dish = document.createElement("div");
    dish.style.cssText = "font-size:0.78rem; margin-bottom:4px;";
    dish.innerHTML = `<span style="color:#d97706; font-weight:700;">🍽️ ${l.dish}</span>`;
    wrap.appendChild(dish);
  }

  const addr = document.createElement("div");
  addr.style.cssText = "font-size:0.73rem; color:#777; margin-bottom:6px; line-height:1.35;";
  addr.textContent = l.address;
  wrap.appendChild(addr);

  const todayHours = getTodayHours(l.openingHours);
  if (todayHours) {
    const isOpen = isOpenNow(l.openingHours);
    const hours = document.createElement("div");
    hours.style.cssText = "font-size:0.73rem; margin-bottom:6px;";
    const color = isOpen === true ? "#16a34a" : isOpen === false ? "#dc2626" : "#777";
    const label = isOpen === true ? "Aberto agora" : isOpen === false ? "Fechado agora" : "";
    hours.innerHTML = `🕐 <span style="color:${color}; font-weight:600;">${label}</span>${label ? " · " : ""}${todayHours}`;
    wrap.appendChild(hours);
  }

  if (l.link) {
    const a = document.createElement("a");
    a.href = l.link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.cssText = "font-size:0.78rem; font-weight:700; color:#d97706; text-decoration:none;";
    a.textContent = "Ver no site →";
    wrap.appendChild(a);
  }

  return wrap;
}

/* ===================================================
   RENDER
   =================================================== */
function renderizar(data, filtro) {
  const cardsEl = document.getElementById("cards");
  const contador = document.getElementById("contador");
  const termo = normalizar(filtro);
  const filtrados = data.filter(l => {
    const alvo =
      normalizar(l.bairro) + " " +
      normalizar(l.name) + " " +
      normalizar(l.address) + " " +
      normalizar(l.dish) + " " +
      normalizar(l.dishDesc);
    return alvo.includes(termo);
  });

  // Update counter
  if (filtrados.length === allData.length) {
    contador.textContent = `${filtrados.length} bares`;
  } else {
    contador.textContent = `${filtrados.length} de ${allData.length} bares encontrados`;
  }

  cardsEl.innerHTML = "";
  markers.clearLayers();

  const points = [];
  filtrados.forEach(l => {
    cardsEl.appendChild(buildCard(l));

    if (Number.isFinite(l.lat) && Number.isFinite(l.lng)) {
      const m = L.marker([l.lat, l.lng]).bindPopup(buildPopup(l), { maxWidth: 260 });
      markers.addLayer(m);
      points.push([l.lat, l.lng]);
    }
  });

  if (points.length) {
    map.fitBounds(L.latLngBounds(points).pad(0.1));
  }
}

/* ===================================================
   BREADCRUMB (neighborhood filter)
   =================================================== */
function gerarBreadcrumb(data) {
  const wrap = document.getElementById("breadcrumb");
  wrap.innerHTML = "";

  const counts = {};
  data.forEach(l => {
    if (l.bairro) counts[l.bairro] = (counts[l.bairro] || 0) + 1;
  });

  const bairros = Object.keys(counts).sort((a, b) =>
    normalizar(a).localeCompare(normalizar(b))
  );

  bairros.forEach(b => {
    const btn = document.createElement("button");
    btn.className = "pill";
    btn.type = "button";
    const countSpan = document.createElement("span");
    countSpan.className = "pill-count";
    countSpan.textContent = counts[b];
    btn.appendChild(document.createTextNode(b + " "));
    btn.appendChild(countSpan);

    btn.addEventListener("click", () => {
      if (activeBairro === b) {
        // Toggle off — show all
        activeBairro = null;
        document.getElementById("search").value = "";
        renderizar(allData, "");
        marcarAtivo(null);
      } else {
        activeBairro = b;
        document.getElementById("search").value = b;
        renderizar(allData, b);
        marcarAtivo(b);
      }
    });
    wrap.appendChild(btn);
  });
}

function marcarAtivo(bairro) {
  document.querySelectorAll("#breadcrumb .pill").forEach(btn => {
    const nome = btn.childNodes[0].textContent.trim();
    btn.classList.toggle("active", nome === bairro);
  });
}

/* ===================================================
   SEARCH INPUT
   =================================================== */
const searchInput = document.getElementById("search");
const searchClear = document.getElementById("search-clear");

searchInput.addEventListener("input", e => {
  const val = e.target.value;
  searchClear.hidden = !val;
  activeBairro = null;
  renderizar(allData, val);
  // Update active pill if matches a bairro exactly
  const lower = normalizar(val);
  const matchedBairro = [...document.querySelectorAll("#breadcrumb .pill")]
    .find(btn => normalizar(btn.childNodes[0].textContent.trim()) === lower);
  marcarAtivo(matchedBairro ? matchedBairro.childNodes[0].textContent.trim() : null);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.hidden = true;
  activeBairro = null;
  marcarAtivo(null);
  renderizar(allData, "");
  searchInput.focus();
});

/* ===================================================
   PROXIMITY SEARCH
   =================================================== */
async function encontrarMaisProximos() {
  const addressInput = document.getElementById("address");
  const contador = document.getElementById("contador");
  if (!addressInput) return;
  const raw = addressInput.value.trim();
  if (!raw) {
    renderizar(allData, searchInput.value);
    return;
  }

  contador.textContent = "⏳ Buscando localização…";

  try {
    const query =
      raw.toLowerCase().includes("rio de janeiro") || raw.toLowerCase().includes("rj")
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

    mostrarProximos(latUser, lngUser, raw);
  } catch {
    document.getElementById("contador").textContent =
      "⚠️ Não foi possível localizar este endereço. Tente ser mais específico (rua, bairro, cidade).";
  }
}

function mostrarProximos(latUser, lngUser, label) {
  const withDistance = allData
    .filter(b => Number.isFinite(b.lat) && Number.isFinite(b.lng))
    .map(b => ({ ...b, distanceKm: haversineKm(latUser, lngUser, b.lat, b.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);

  const contador = document.getElementById("contador");
  if (!withDistance.length) {
    contador.textContent = "⚠️ Não há bares com coordenadas para calcular a distância.";
    return;
  }

  marcarAtivo(null);
  searchInput.value = "";
  searchClear.hidden = true;
  activeBairro = null;
  renderizar(withDistance, "");
  contador.textContent = `📍 ${withDistance.length} bares mais próximos${label ? " de: " + label : ""}`;
}

document.getElementById("nearby-btn").addEventListener("click", encontrarMaisProximos);

const addressInputEl = document.getElementById("address");
if (addressInputEl) {
  addressInputEl.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); encontrarMaisProximos(); }
  });
}

/* ===================================================
   GEOLOCATION
   =================================================== */
function encontrarPorLocalizacao() {
  const contador = document.getElementById("contador");
  if (!navigator.geolocation) {
    contador.textContent = "⚠️ Geolocalização não é suportada pelo seu navegador.";
    return;
  }

  contador.textContent = "⏳ Obtendo localização do dispositivo…";

  if (navigator.permissions) {
    navigator.permissions.query({ name: "geolocation" }).then(status => {
      if (status.state === "denied") {
        contador.textContent = "⚠️ Permissão de geolocalização negada. Verifique as configurações do navegador.";
      }
    });
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const latUser = position.coords.latitude;
      const lngUser = position.coords.longitude;

      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
        userLocationMarker = null;
      }

      userLocationMarker = L.circleMarker([latUser, lngUser], {
        radius: 10, color: "#d97706", fillColor: "#d97706",
        fillOpacity: 0.85, weight: 2,
      })
        .bindPopup("📍 Você está aqui")
        .addTo(map)
        .openPopup();

      mostrarProximos(latUser, lngUser, "");
      map.setView([latUser, lngUser], 13);
    },
    error => {
      let msg = "⚠️ Não foi possível obter sua localização.";
      if (error.code === error.PERMISSION_DENIED)
        msg = "⚠️ Permissão de geolocalização negada. Permita o acesso e tente novamente.";
      else if (error.code === error.POSITION_UNAVAILABLE)
        msg = "⚠️ Localização indisponível no momento.";
      else if (error.code === error.TIMEOUT)
        msg = "⚠️ Tempo de resposta da localização expirou. Tente novamente.";
      document.getElementById("contador").textContent = msg;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

document.getElementById("nearby-geoloc-btn").addEventListener("click", encontrarPorLocalizacao);

/* ===================================================
   THEME TOGGLE
   =================================================== */
const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const saved = localStorage.getItem("theme") || (prefersDark ? "dark" : "light");
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

/* ===================================================
   INIT
   =================================================== */
carregarDados();
