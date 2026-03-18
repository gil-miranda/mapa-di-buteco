function normalizar(t) {
  return t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

let allData = [];
let map = L.map("map").setView([-14.2, -51.9], 4);
let markers = L.layerGroup().addTo(map);
let cidadeAtual = "rio-de-janeiro";

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);

function carregarCidades() {
  const select = document.getElementById("cidade-select");
  const cidades = [
    "belem", "belo-horizonte", "blumenau", "brasilia-butecos", "campinas", "curitiba-butecos", "florianopolis",
    "fortaleza", "goias", "joinville", "juiz-de-fora", "londrina", "manaus-butecos", "maringa", "montes-claros",
    "niteroi", "nova-iguacu-duque-de-caxias", "pocos-de-caldas", "porto-alegre", "recife", "ribeirao-preto",
    "rio-de-janeiro", "salvador", "sao-jose-do-rio-preto", "sao-paulo", "triangulo-mineiro", "vale-do-aco"
  ];
  cidades.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    select.appendChild(opt);
  });
  select.value = cidadeAtual;
  select.addEventListener("change", () => {
    cidadeAtual = select.value;
    carregarCSV(cidadeAtual);
  });
}

function carregarCSV(cidade) {
  Papa.parse(`data/${cidade}.csv`, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      allData = results.data.filter(l => l.name && l.address);
      gerarBreadcrumb(allData);
      renderizar(allData, document.getElementById("search").value);
    }
  });
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

function renderizar(data, filtro) {
  const cards = document.getElementById("cards");
  const contador = document.getElementById("contador");
  const termo = normalizar(filtro);
  const filtrados = data.filter(l => normalizar(l.bairro).includes(termo));
  contador.textContent = `🔎 ${filtrados.length} bares encontrados`;
  cards.innerHTML = "";
  markers.clearLayers();

  filtrados.forEach(l => {
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

    const safeLink = safeURL(l.link);
    if (safeLink) {
      const a = document.createElement("a");
      a.href = safeLink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Ver no site oficial";
      el.appendChild(a);
    }

    cards.appendChild(el);

    if (l.lat && l.lng) {
      const lat = parseFloat(l.lat);
      const lng = parseFloat(l.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const popupDiv = document.createElement("div");
        const popupStrong = document.createElement("strong");
        popupStrong.textContent = l.name;
        popupDiv.appendChild(popupStrong);
        popupDiv.appendChild(document.createElement("br"));
        popupDiv.append(l.address);
        if (safeLink) {
          popupDiv.appendChild(document.createElement("br"));
          const popupA = document.createElement("a");
          popupA.href = safeLink;
          popupA.target = "_blank";
          popupA.rel = "noopener noreferrer";
          popupA.textContent = "Ver no site";
          popupDiv.appendChild(popupA);
        }
        const m = L.marker([lat, lng]).bindPopup(popupDiv);
        markers.addLayer(m);
      }
    }
  });

  if (filtrados.length && filtrados[0].lat && filtrados[0].lng) {
    const lat = parseFloat(filtrados[0].lat);
    const lng = parseFloat(filtrados[0].lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], 13);
    }
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

carregarCidades();
carregarCSV(cidadeAtual);

