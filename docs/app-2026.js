function normalizar(t) {
  return t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

let mapInstance = null;
let markersLayer = null;

function initTheme() {
  const root = document.documentElement;
  const stored = localStorage.getItem("theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = stored || (prefersDark ? "dark" : "light");
  if (initial === "light") {
    root.setAttribute("data-theme", "light");
  }

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isLight = root.getAttribute("data-theme") === "light";
    if (isLight) {
      root.removeAttribute("data-theme");
      localStorage.setItem("theme", "dark");
    } else {
      root.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    }
  });
}

function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer || typeof L === "undefined") {
    return null;
  }

  const map = L.map("map").setView([-22.9068, -43.1729], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  return map;
}

function buildCoordsIndexFromCsv(csvText) {
  const index = {};
  if (typeof Papa === "undefined") {
    return index;
  }
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true
  });
  if (!parsed.data) return index;
  parsed.data.forEach(row => {
    if (!row.name || !row.lat || !row.lng) return;
    const key = normalizar(row.name);
    const lat = parseFloat(row.lat);
    const lng = parseFloat(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    index[key] = { lat, lng };
  });
  return index;
}

async function loadBarsAndMarkers() {
  if (!mapInstance || !markersLayer) return;

  try {
    const [jsonRes, csvRes] = await Promise.allSettled([
      fetch("data/comida_di_buteco_rj_2026.json"),
      fetch("data/rio-de-janeiro.csv")
    ]);

    let jsonData = [];
    let csvText = "";

    if (jsonRes.status === "fulfilled" && jsonRes.value.ok) {
      jsonData = await jsonRes.value.json();
    }
    if (csvRes.status === "fulfilled" && csvRes.value.ok) {
      csvText = await csvRes.value.text();
    }

    const coordsIndex = csvText ? buildCoordsIndexFromCsv(csvText) : {};

    let bars = [];

    if (jsonData && Array.isArray(jsonData) && jsonData.length) {
      bars = jsonData.map((item, idx) => {
        const key = normalizar(item.name);
        const coords = coordsIndex[key] || null;
        return {
          id: idx,
          name: item.name,
          bairro: item.neighborhood_or_region || "",
          address: item.address || "",
          dish: item.dish_name || "",
          link: item.source_url || "",
          lat: coords ? coords.lat : null,
          lng: coords ? coords.lng : null
        };
      });
    } else if (csvText && typeof Papa !== "undefined") {
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true
      });
      bars = (parsed.data || []).map((row, idx) => ({
        id: idx,
        name: row.name,
        bairro: row.bairro || "",
        address: row.address || "",
        dish: "",
        link: row.link || "",
        lat: row.lat ? parseFloat(row.lat) : null,
        lng: row.lng ? parseFloat(row.lng) : null
      }));
    }

    markersLayer.clearLayers();
    const points = [];

    bars.forEach(bar => {
      if (bar.lat == null || bar.lng == null) return;
      const marker = L.marker([bar.lat, bar.lng]).bindPopup(
        `<strong>${bar.name}</strong><br/>` +
        (bar.dish ? `${bar.dish}<br/>` : "") +
        `${bar.address}<br/>` +
        (bar.link ? `<a href="${bar.link}" target="_blank" rel="noopener noreferrer">Ver detalhes</a>` : "")
      );
      markersLayer.addLayer(marker);
      points.push([bar.lat, bar.lng]);
    });

    if (points.length) {
      const bounds = L.latLngBounds(points);
      mapInstance.fitBounds(bounds.pad(0.1));
    }
  } catch (e) {
    // Fail silently for now; later we can show a UI error.
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  mapInstance = initMap();
  loadBarsAndMarkers();
});


