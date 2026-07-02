const land = {
  backWidth: 110,
  frontWidth: 168,
  length: 503.6,
  roads: 3,
  roadWidth: 10,
  rows: 6,
  centerLat: -9.981726,
  centerLng: -67.8869668,
};

land.totalArea = ((land.backWidth + land.frontWidth) / 2) * land.length;
land.roadArea = land.roads * land.roadWidth * land.length;
land.usableArea = land.totalArea - land.roadArea;

const svg = document.querySelector("#lotMap");
const details = document.querySelector("#lotDetails");
const searchInput = document.querySelector("#lotSearch");
const searchButton = document.querySelector("#searchButton");
const rowFilter = document.querySelector("#rowFilter");
const minAreaInput = document.querySelector("#minAreaInput");
const minAreaRange = document.querySelector("#minAreaRange");
const minFrontageInput = document.querySelector("#minFrontageInput");
const minFrontageRange = document.querySelector("#minFrontageRange");

const summaryTotalArea = document.querySelector("#summaryTotalArea");
const summaryRoadArea = document.querySelector("#summaryRoadArea");
const summaryLotCount = document.querySelector("#summaryLotCount");
const summaryUsableArea = document.querySelector("#summaryUsableArea");
const summaryFrontage = document.querySelector("#summaryFrontage");
const summaryMinArea = document.querySelector("#summaryMinArea");
const mobileTotalArea = document.querySelector("#mobileTotalArea");
const mobileLotArea = document.querySelector("#mobileLotArea");
const mobileLotCount = document.querySelector("#mobileLotCount");
const mobileFrontage = document.querySelector("#mobileFrontage");
const zoomRange = document.querySelector("#zoomRange");
const zoomOut = document.querySelector("#zoomOut");
const zoomIn = document.querySelector("#zoomIn");
const zoomReset = document.querySelector("#zoomReset");
const mapWrap = document.querySelector(".svg-wrap");

const lots = [];
let selectedLot = null;
let layout = null;
let zoomPercent = 100;

const fmt = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function formatNumber(value, digits) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatArea(value) {
  return formatNumber(value, 1);
}

function formatMeters(value) {
  return formatNumber(value, 2);
}

function formatAreaSmart(value) {
  return Number.isInteger(value) ? formatNumber(value, 0) : formatArea(value);
}

function computeLayout(minArea, minFrontage) {
  const target = Number(minArea);
  const frontageTarget = Number(minFrontage);
  const maxColumnsByArea = land.usableArea / (land.rows * target);
  const maxColumnsByFrontage = land.length / frontageTarget;
  const columns = Math.max(1, Math.floor(Math.min(maxColumnsByArea, maxColumnsByFrontage)));
  const totalLots = land.rows * columns;
  const averageArea = land.usableArea / totalLots;
  const averageFrontage = land.length / columns;

  return {
    minArea: target,
    minFrontage: frontageTarget,
    columns,
    totalLots,
    averageArea,
    averageFrontage,
  };
}

function widthAt(x) {
  return land.backWidth + ((land.frontWidth - land.backWidth) * x) / land.length;
}

function rowHeightAt(x) {
  return (widthAt(x) - land.roads * land.roadWidth) / land.rows;
}

function yFor(row, edge, x) {
  const h = rowHeightAt(x);
  const beforeRoads = row <= 1 ? 0 : row <= 3 ? 1 : row <= 5 ? 2 : 3;
  const base = (row - 1) * h + beforeRoads * land.roadWidth;
  return edge === "top" ? base + h : base;
}

function roadY(index, edge, x) {
  const h = rowHeightAt(x);
  const afterRow = index * 2 - 1;
  const previousRoads = index - 1;
  const base = afterRow * h + previousRoads * land.roadWidth;
  return edge === "top" ? base + land.roadWidth : base;
}

function sx(x) {
  return x;
}

function sy(y) {
  return land.frontWidth - y;
}

function polygonPoints(points) {
  return points.map(([x, y]) => `${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(" ");
}

function areaForLot(x0, x1) {
  const h0 = rowHeightAt(x0);
  const h1 = rowHeightAt(x1);
  return ((h0 + h1) / 2) * (x1 - x0);
}

function metersToCoordinate(x, y) {
  const widthHere = widthAt(x);
  const eastMeters = x - land.length / 2;
  const northMeters = y - widthHere / 2;
  const metersPerLat = 111_320;
  const metersPerLng = 111_320 * Math.cos((land.centerLat * Math.PI) / 180);
  const lat = land.centerLat + northMeters / metersPerLat;
  const lng = land.centerLng + eastMeters / metersPerLng;
  return { lat, lng };
}

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(7)},${lng.toFixed(7)}`;
}

function mapsDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(7)},${lng.toFixed(7)}`;
}

function createSvgElement(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function syncMinArea(value) {
  const normalized = String(Math.max(120, Math.min(600, Number(value))));
  minAreaInput.value = normalized;
  minAreaRange.value = normalized;
  return Number(normalized);
}

function syncMinFrontage(value) {
  const normalized = String(Math.max(10, Math.min(24, Number(value))));
  minFrontageInput.value = normalized;
  minFrontageRange.value = normalized;
  return Number(normalized);
}

function updateSummary() {
  summaryTotalArea.textContent = `${formatArea(land.totalArea)} m²`;
  summaryRoadArea.textContent = `Área das ruas: ${formatAreaSmart(land.roadArea)} m²`;
  summaryLotCount.textContent = String(layout.totalLots);
  summaryUsableArea.textContent = `Área útil: ${formatArea(land.usableArea)} m²`;
  summaryFrontage.textContent = `${formatMeters(layout.minFrontage)} m`;
  summaryMinArea.textContent = `Mínimo: ${formatAreaSmart(layout.minArea)} m² | Média: ${formatArea(layout.averageArea)} m²`;
  if (mobileTotalArea) mobileTotalArea.textContent = `${formatArea(land.totalArea)} m²`;
  if (mobileLotArea) mobileLotArea.textContent = `${formatArea(layout.averageArea)} m²`;
  if (mobileLotCount) mobileLotCount.textContent = String(layout.totalLots);
  if (mobileFrontage) mobileFrontage.textContent = `${formatMeters(layout.minFrontage)} m`;
}

function updateZoom(nextZoom) {
  zoomPercent = Math.max(Number(zoomRange.min), Math.min(Number(zoomRange.max), Math.round(nextZoom)));
  zoomRange.value = String(zoomPercent);
  svg.style.width = `${zoomPercent}%`;
}

function buildLots() {
  lots.length = 0;
  const lotWidth = land.length / layout.columns;
  let number = 1;

  for (let row = 1; row <= land.rows; row += 1) {
    for (let col = 1; col <= layout.columns; col += 1) {
      const x0 = (col - 1) * lotWidth;
      const x1 = col * lotWidth;
      const y0x0 = yFor(row, "bottom", x0);
      const y0x1 = yFor(row, "bottom", x1);
      const y1x1 = yFor(row, "top", x1);
      const y1x0 = yFor(row, "top", x0);
      const centerX = (x0 + x1) / 2;
      const centerY = (yFor(row, "bottom", centerX) + yFor(row, "top", centerX)) / 2;
      const coords = metersToCoordinate(centerX, centerY);

      lots.push({
        id: `F${row}-${String(col).padStart(2, "0")}`,
        number,
        row,
        col,
        x0,
        x1,
        centerX,
        centerY,
        lotWidth,
        depthStart: y1x0 - y0x0,
        depthEnd: y1x1 - y0x1,
        depthAvg: rowHeightAt(centerX),
        area: areaForLot(x0, x1),
        lat: coords.lat,
        lng: coords.lng,
        points: [
          [x0, y0x0],
          [x1, y0x1],
          [x1, y1x1],
          [x0, y1x0],
        ],
      });

      number += 1;
    }
  }
}

function drawBaseMap() {
  svg.setAttribute("viewBox", `-14 -16 ${land.length + 28} ${land.frontWidth + 34}`);
  svg.setAttribute("aria-label", `Mapa interativo com ${layout.totalLots} lotes`);
  svg.innerHTML = "";

  const defs = createSvgElement("defs");
  defs.innerHTML = `
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#102017" flood-opacity="0.35"></feDropShadow>
    </filter>
  `;
  svg.appendChild(defs);

  const boundary = createSvgElement("polygon", {
    class: "boundary",
    points: polygonPoints([
      [0, 0],
      [land.length, 0],
      [land.length, land.frontWidth],
      [0, land.backWidth],
    ]),
    filter: "url(#softShadow)",
  });
  svg.appendChild(boundary);

  for (let index = 1; index <= land.roads; index += 1) {
    const road = createSvgElement("polygon", {
      class: "road",
      points: polygonPoints([
        [0, roadY(index, "bottom", 0)],
        [land.length, roadY(index, "bottom", land.length)],
        [land.length, roadY(index, "top", land.length)],
        [0, roadY(index, "top", 0)],
      ]),
    });
    svg.appendChild(road);

    const label = createSvgElement("text", {
      class: "road-label",
      x: land.length / 2,
      y: sy((roadY(index, "bottom", land.length / 2) + roadY(index, "top", land.length / 2)) / 2) + 1.4,
    });
    label.textContent = `Rua ${index} - 10 m`;
    svg.appendChild(label);
  }
}

function drawLots() {
  lots.forEach((lot) => {
    const shape = createSvgElement("polygon", {
      class: "lot",
      points: polygonPoints(lot.points),
      tabindex: "0",
      role: "button",
      "aria-label": `Lote ${lot.id}, numero ${lot.number}`,
      "data-id": lot.id,
      "data-row": lot.row,
    });

    shape.addEventListener("click", () => selectLot(lot.id));
    shape.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectLot(lot.id);
      }
    });

    svg.appendChild(shape);
  });

  for (let row = 1; row <= land.rows; row += 1) {
    const x = land.length * 0.58;
    const y = (yFor(row, "bottom", x) + yFor(row, "top", x)) / 2;
    const label = createSvgElement("text", {
      class: "row-label",
      x,
      y: sy(y) + 1.6,
    });
    label.textContent = `Fileira ${row}`;
    svg.appendChild(label);
  }

  const depthLabel = createSvgElement("text", {
    class: "axis-label",
    x: land.length / 2,
    y: land.frontWidth + 11,
  });
  depthLabel.textContent = "Profundidade 503,6 m";
  svg.appendChild(depthLabel);

  const backLabel = createSvgElement("text", {
    class: "axis-label",
    x: -8,
    y: sy(land.backWidth / 2),
    transform: `rotate(-90 -8 ${sy(land.backWidth / 2)})`,
  });
  backLabel.textContent = "Fundo 110 m";
  svg.appendChild(backLabel);

  const frontLabel = createSvgElement("text", {
    class: "axis-label",
    x: land.length + 8,
    y: sy(land.frontWidth / 2),
    transform: `rotate(90 ${land.length + 8} ${sy(land.frontWidth / 2)})`,
  });
  frontLabel.textContent = "Frente 168 m";
  svg.appendChild(frontLabel);
}

function updateLotClasses() {
  const filter = rowFilter.value;
  svg.querySelectorAll(".lot").forEach((shape) => {
    const isSelected = selectedLot && shape.dataset.id === selectedLot.id;
    const isMuted = filter !== "all" && shape.dataset.row !== filter;
    shape.classList.toggle("is-selected", isSelected);
    shape.classList.toggle("is-muted", isMuted);
  });
}

function renderDetails(lot) {
  const maps = mapsUrl(lot.lat, lot.lng);
  const directions = mapsDirectionsUrl(lot.lat, lot.lng);
  details.innerHTML = `
    <div>
      <small>Lote selecionado</small>
      <h3>${lot.id} <span class="lot-number">#${lot.number}</span></h3>
      <small>Malha atual: ${layout.totalLots} lotes | média: ${formatArea(layout.averageArea)} m²</small>
    </div>
    <div class="detail-grid">
      <div><span>Fileira</span><strong>${lot.row}</strong></div>
      <div><span>Posicao</span><strong>${lot.col}/${layout.columns}</strong></div>
      <div class="metric-primary"><span>Frente</span><strong>${formatMeters(lot.lotWidth)} m</strong></div>
      <div class="metric-primary"><span>Prof. media</span><strong>${formatMeters(lot.depthAvg)} m</strong></div>
      <div><span>Profundidade no inicio</span><strong>${formatMeters(lot.depthStart)} m</strong></div>
      <div><span>Profundidade no fim</span><strong>${formatMeters(lot.depthEnd)} m</strong></div>
      <div class="metric-primary"><span>Área estimada</span><strong>${formatArea(lot.area)} m²</strong></div>
      <div><span>Coordenada</span><strong>${lot.lat.toFixed(5)}, ${lot.lng.toFixed(5)}</strong></div>
    </div>
    <div class="detail-actions">
      <a href="${maps}" target="_blank" rel="noreferrer">Ver este lote no Google Maps</a>
      <a href="${directions}" target="_blank" rel="noreferrer">Tracar rota ate o lote</a>
    </div>
    <small>A frente cresce quando o minimo sobe. A area total continua sendo preenchida sem sobras.</small>
  `;
}

function selectLot(id) {
  const lot = lots.find((item) => item.id === id || String(item.number) === String(id));
  if (!lot) {
    details.innerHTML = "<p>Nao encontrei esse lote. Tente algo como 124 ou F3-14.</p>";
    return;
  }

  selectedLot = lot;
  searchInput.value = lot.id;
  updateLotClasses();
  renderDetails(lot);

  const selectedShape = svg.querySelector(`[data-id="${lot.id}"]`);
  selectedShape?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function normalizeSearch(value) {
  const clean = value.trim().toUpperCase().replace(/\s+/g, "");
  const rowCol = clean.match(/^F?([1-6])[-.]?([0-9]{1,2})$/);
  if (rowCol && clean.startsWith("F")) {
    return `F${rowCol[1]}-${String(Number(rowCol[2])).padStart(2, "0")}`;
  }
  return clean;
}

function rebuildLayout(minArea, keepSelection = true) {
  const previousId = keepSelection ? selectedLot?.id : null;
  layout = computeLayout(minArea, layout?.minFrontage ?? 10);
  updateSummary();
  buildLots();
  drawBaseMap();
  drawLots();
  updateLotClasses();

  const nextId = previousId && lots.some((lot) => lot.id === previousId) ? previousId : "F1-01";
  selectLot(nextId);
}

function runSearch() {
  const value = normalizeSearch(searchInput.value);
  selectLot(value);
}

function init() {
  const minArea = syncMinArea(minAreaInput.value);
  const minFrontage = syncMinFrontage(minFrontageInput.value);
  layout = computeLayout(minArea, minFrontage);
  updateSummary();
  buildLots();
  drawBaseMap();
  drawLots();
  updateZoom(100);
  selectLot("F1-01");

  searchButton.addEventListener("click", runSearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runSearch();
  });

  rowFilter.addEventListener("change", updateLotClasses);

  const onMinAreaChange = (value) => {
    const nextValue = syncMinArea(value);
    rebuildLayout(nextValue);
  };

  const onMinFrontageChange = (value) => {
    const nextValue = syncMinFrontage(value);
    layout = computeLayout(layout.minArea, nextValue);
    updateSummary();
    buildLots();
    drawBaseMap();
    drawLots();
    updateLotClasses();
    selectLot(selectedLot?.id ?? "F1-01");
  };

  minAreaInput.addEventListener("input", (event) => onMinAreaChange(event.target.value));
  minAreaRange.addEventListener("input", (event) => onMinAreaChange(event.target.value));
  minFrontageInput.addEventListener("input", (event) => onMinFrontageChange(event.target.value));
  minFrontageRange.addEventListener("input", (event) => onMinFrontageChange(event.target.value));

  zoomRange.addEventListener("input", (event) => updateZoom(Number(event.target.value)));
  zoomOut.addEventListener("click", () => updateZoom(zoomPercent - 10));
  zoomIn.addEventListener("click", () => updateZoom(zoomPercent + 10));
  zoomReset.addEventListener("click", () => updateZoom(100));

  mapWrap.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      updateZoom(zoomPercent + (event.deltaY < 0 ? 10 : -10));
    },
    { passive: false },
  );
}

init();
