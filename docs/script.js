function normalizar(t) {
  return t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

let allData = [];
let map = L.map("map").setView([-14.2, -51.9], 4);
let markers = L.layerGroup().addTo(map);
let cidadeAtual = "rio-de-janeiro";

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
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
    el.innerHTML = `<h2>${l.name}</h2><p>${l.address}</p><small><strong>Bairro:</strong> ${l.bairro}</small><br/>` +
                   (l.link ? `<a href="${l.link}" target="_blank">Ver no site oficial</a>` : "");
    cards.appendChild(el);
    if (l.lat && l.lng) {
      const m = L.marker([parseFloat(l.lat), parseFloat(l.lng)])
        .bindPopup(`<strong>${l.name}</strong><br>${l.address}<br><a href="${l.link}" target="_blank">Ver no site</a>`);
      markers.addLayer(m);
    }
  });

  if (filtrados.length && filtrados[0].lat && filtrados[0].lng) {
    map.setView([parseFloat(filtrados[0].lat), parseFloat(filtrados[0].lng)], 13);
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
