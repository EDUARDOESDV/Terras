const land = {
  backWidth: 113,
  frontWidth: 161,
  length: 400,
  sideUpper: 412,
  sideLower: 451,
  horizontalRoads: 3,
  horizontalRoadWidth: 10,
  verticalRoadWidth: 10,
  verticalRoadPosition: "center",
  corners: {
    topLeft: { lat: -9.980251, lng: -67.88806 },
    topRight: { lat: -9.980187, lng: -67.886555 },
    bottomRight: { lat: -9.984028, lng: -67.886069 },
    bottomLeft: { lat: -9.984091, lng: -67.886889 },
  },
};

const rasterScene = {
  width: 992,
  height: 558,
  corners: {
    topLeft: { x: 51, y: 310 },
    topRight: { x: 806, y: 102 },
    bottomRight: { x: 815, y: 388 },
    bottomLeft: { x: 62, y: 475 },
  },
};

function refreshLandMetrics() {
  land.rows = land.horizontalRoads * 2;
  land.totalArea = ((land.backWidth + land.frontWidth) / 2) * land.length;
  const road = resolveVerticalRoad();
  land.verticalRoad = road;
  land.verticalRoadStart = road.start;
  land.verticalRoadEnd = road.end;
  land.horizontalRoadArea = land.horizontalRoads * land.horizontalRoadWidth * land.length;
  land.verticalRoadPerRowArea = rowAreaPrefix(road.end) - rowAreaPrefix(road.start);
  land.verticalRoadArea = land.verticalRoadPerRowArea * land.rows;
  land.roadArea = land.horizontalRoadArea + land.verticalRoadArea;
  land.usableArea = land.totalArea - land.roadArea;
}

refreshLandMetrics();

const svg = document.querySelector("#lotMap");
const details = document.querySelector("#lotDetails");
const searchInput = document.querySelector("#lotSearch");
const searchButton = document.querySelector("#searchButton");
const rowFilter = document.querySelector("#rowFilter");
const minAreaInput = document.querySelector("#minAreaInput");
const minAreaRange = document.querySelector("#minAreaRange");
const minFrontageInput = document.querySelector("#minFrontageInput");
const minFrontageRange = document.querySelector("#minFrontageRange");
const verticalRoadPositionInput = document.querySelector("#verticalRoadPositionInput");
const highlightEligibleInput = document.querySelector("#highlightEligibleInput");

const summaryTotalArea = document.querySelector("#summaryTotalArea");
const summaryRoadCount = document.querySelector("#summaryRoadCount");
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
const mapViewModeInput = document.querySelector("#mapViewModeInput");
const realMap = document.querySelector("#realMap");

const lots = [];
const lotsById = new Map();
let selectedLot = null;
let layout = null;
let zoomPercent = 100;
let map = null;
let mapTileLayer = null;
let boundaryLayer = null;
let roadLayers = [];
let lotLayers = [];
let labelLayers = [];
let mapBaseZoom = 16;

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

function rowLabelFor(row) {
  if (row === 1) return "Fileira 1 - externa inferior";
  if (row === land.rows) return `Fileira ${row} - externa superior`;
  return `Fileira ${row}`;
}

function rowAreaPrefix(x) {
  const roadBand = land.horizontalRoads * land.horizontalRoadWidth;
  const linear = (land.backWidth - roadBand) / land.rows;
  const quadratic = (land.frontWidth - land.backWidth) / (land.rows * land.length);
  return linear * x + 0.5 * quadratic * x * x;
}

function resolveVerticalRoad(position = land.verticalRoadPosition) {
  const centerRatios = {
    start: 0.2,
    center: 0.5,
    end: 0.8,
  };
  const center = land.length * (centerRatios[position] ?? centerRatios.center);
  const half = land.verticalRoadWidth / 2;
  const start = Math.max(0, Math.min(land.length - land.verticalRoadWidth, center - half));
  const end = start + land.verticalRoadWidth;
  return { position, center, start, end };
}

function invertRowAreaPrefix(targetArea, start, end) {
  let low = start;
  let high = end;

  for (let index = 0; index < 48; index += 1) {
    const mid = (low + high) / 2;
    if (rowAreaPrefix(mid) < targetArea) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

function buildBoundsForSegments(leftColumns, rightColumns) {
  const road = land.verticalRoad;
  const leftArea = rowAreaPrefix(road.start);
  const rightArea = rowAreaPrefix(land.length) - rowAreaPrefix(road.end);
  const lotBands = [];

  const leftBounds = [0];
  for (let index = 1; index < leftColumns; index += 1) {
    leftBounds.push(invertRowAreaPrefix((leftArea * index) / leftColumns, 0, road.start));
  }
  leftBounds.push(road.start);
  for (let index = 0; index < leftBounds.length - 1; index += 1) {
    lotBands.push([leftBounds[index], leftBounds[index + 1]]);
  }

  const rightBounds = [road.end];
  for (let index = 1; index < rightColumns; index += 1) {
    rightBounds.push(
      invertRowAreaPrefix(
        rowAreaPrefix(road.end) + (rightArea * index) / rightColumns,
        road.end,
        land.length,
      ),
    );
  }
  rightBounds.push(land.length);
  for (let index = 0; index < rightBounds.length - 1; index += 1) {
    lotBands.push([rightBounds[index], rightBounds[index + 1]]);
  }

  return { lotBands, leftArea, rightArea };
}

function computeLayout(minArea, minFrontage) {
  const target = Number(minArea);
  const frontageTarget = Number(minFrontage);
  const road = land.verticalRoad ?? resolveVerticalRoad();
  const leftArea = rowAreaPrefix(road.start);
  const rightArea = rowAreaPrefix(land.length) - rowAreaPrefix(road.end);
  const totalArea = leftArea + rightArea;
  const maxColumnsByArea = Math.max(1, Math.floor(totalArea / target));

  const makeCandidate = (columns, leftColumns) => {
    const rightColumns = columns - leftColumns;
    if (leftColumns < 1 || rightColumns < 1) return null;
    const leftLotArea = leftArea / leftColumns;
    const rightLotArea = rightArea / rightColumns;
    if (leftLotArea + 1e-6 < target || rightLotArea + 1e-6 < target) return null;

    const next = buildBoundsForSegments(leftColumns, rightColumns);
    const widths = next.lotBands.map(([startX, endX]) => endX - startX);
    const tooNarrow = widths.some((width) => width + 1e-6 < frontageTarget);
    if (tooNarrow) return null;

    return {
      columns,
      leftColumns,
      rightColumns,
      lotBands: next.lotBands,
      leftArea,
      rightArea,
      leftLotArea,
      rightLotArea,
      averageArea: totalArea / columns,
      averageFrontage: land.length / columns,
      minFrontageActual: Math.min(...widths),
      maxFrontageActual: Math.max(...widths),
      columnWidths: widths,
      columnAreas: Array.from({ length: leftColumns }, () => leftLotArea).concat(
        Array.from({ length: rightColumns }, () => rightLotArea),
      ),
    };
  };

  for (let columns = maxColumnsByArea; columns >= 2; columns -= 1) {
    const idealLeft = Math.max(1, Math.min(columns - 1, Math.round((columns * leftArea) / totalArea)));
    let best = null;

    for (const leftColumns of [idealLeft - 2, idealLeft - 1, idealLeft, idealLeft + 1, idealLeft + 2]) {
      const candidate = makeCandidate(columns, leftColumns);
      if (!candidate) continue;
      const score = Math.abs(candidate.leftLotArea - candidate.rightLotArea);
      if (!best || score < best.score) {
        best = { ...candidate, score };
      }
    }

    if (best) {
      return {
        minArea: target,
        minFrontage: frontageTarget,
        roadPosition: road.position,
        roadStart: road.start,
        roadEnd: road.end,
        roadCenter: road.center,
        roadWidth: land.verticalRoadWidth,
        totalLots: land.rows * best.columns,
        columns: best.columns,
        leftColumns: best.leftColumns,
        rightColumns: best.rightColumns,
        averageArea: best.averageArea,
        averageFrontage: best.averageFrontage,
        minFrontageActual: best.minFrontageActual,
        maxFrontageActual: best.maxFrontageActual,
        lotBands: best.lotBands,
        columnWidths: best.columnWidths,
        columnAreas: best.columnAreas,
        leftArea: best.leftArea,
        rightArea: best.rightArea,
      };
    }
  }

  const fallbackColumns = 1;
  const fallbackBounds = [0, land.length];
  return {
    minArea: target,
    minFrontage: frontageTarget,
    roadPosition: road.position,
    roadStart: road.start,
    roadEnd: road.end,
    roadCenter: road.center,
    roadWidth: land.verticalRoadWidth,
    totalLots: land.rows * fallbackColumns,
    columns: fallbackColumns,
    leftColumns: 1,
    rightColumns: 1,
    averageArea: totalArea,
    averageFrontage: land.length,
    minFrontageActual: land.length,
    maxFrontageActual: land.length,
    lotBands: [[0, land.length]],
    columnWidths: [land.length],
    columnAreas: [totalArea],
    leftArea,
    rightArea,
  };
}

function widthAt(x) {
  return land.backWidth + ((land.frontWidth - land.backWidth) * x) / land.length;
}

function rowHeightAt(x) {
  return (widthAt(x) - land.horizontalRoads * land.horizontalRoadWidth) / land.rows;
}

function yFor(row, edge, x) {
  const h = rowHeightAt(x);
  const beforeRoads = row <= 1 ? 0 : row <= 3 ? 1 : row <= 5 ? 2 : 3;
  const base = (row - 1) * h + beforeRoads * land.horizontalRoadWidth;
  return edge === "top" ? base + h : base;
}

function roadY(index, edge, x) {
  const h = rowHeightAt(x);
  const afterRow = index * 2 - 1;
  const previousRoads = index - 1;
  const base = afterRow * h + previousRoads * land.horizontalRoadWidth;
  return edge === "top" ? base + land.horizontalRoadWidth : base;
}

function polygonPoints(points) {
  return points
    .map(([x, y]) => {
      const point = screenFromLocal(x, y);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");
}

function areaForLot(x0, x1) {
  const h0 = rowHeightAt(x0);
  const h1 = rowHeightAt(x1);
  return ((h0 + h1) / 2) * (x1 - x0);
}

function lerpPoint(a, b, t) {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

function lerpPoint2D(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function geoFromLocal(x, y) {
  const u = x / land.length;
  const widthHere = widthAt(x);
  const v = widthHere <= 0 ? 0 : y / widthHere;
  const bottom = lerpPoint(land.corners.bottomLeft, land.corners.bottomRight, u);
  const top = lerpPoint(land.corners.topLeft, land.corners.topRight, u);
  return lerpPoint(bottom, top, v);
}

function screenFromLocal(x, y) {
  const u = x / land.length;
  const widthHere = widthAt(x);
  const v = widthHere <= 0 ? 0 : y / widthHere;
  const top = lerpPoint2D(rasterScene.corners.topLeft, rasterScene.corners.topRight, u);
  const bottom = lerpPoint2D(rasterScene.corners.bottomLeft, rasterScene.corners.bottomRight, u);
  return lerpPoint2D(bottom, top, v);
}

function metersToCoordinate(x, y) {
  return geoFromLocal(x, y);
}

function localToLatLng(x, y) {
  const coords = metersToCoordinate(x, y);
  return [coords.lat, coords.lng];
}

function localPointsToLatLng(points) {
  return points.map(([x, y]) => localToLatLng(x, y));
}

function averageLatLng(points) {
  const total = points.reduce(
    (acc, point) => {
      acc.lat += point[0];
      acc.lng += point[1];
      return acc;
    },
    { lat: 0, lng: 0 },
  );
  return [total.lat / points.length, total.lng / points.length];
}

function polygonCentroid(points) {
  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }

  const area = twiceArea / 2;
  if (Math.abs(area) < 1e-6) {
    const fallback = points.reduce(
      (acc, [x, y]) => {
        acc.x += x;
        acc.y += y;
        return acc;
      },
      { x: 0, y: 0 },
    );
    return {
      x: fallback.x / points.length,
      y: fallback.y / points.length,
    };
  }

  return {
    x: centroidX / (3 * twiceArea),
    y: centroidY / (3 * twiceArea),
  };
}

function landCenterGeo() {
  const centroid = polygonCentroid([
    [0, 0],
    [land.length, 0],
    [land.length, land.frontWidth],
    [0, land.backWidth],
  ]);
  return geoFromLocal(centroid.x, centroid.y);
}

function realMapEmbedUrl() {
  const center = landCenterGeo();
  return `https://www.google.com/maps?q=${center.lat.toFixed(7)},${center.lng.toFixed(7)}&z=18&t=k&output=embed`;
}

function lotFillStyle(lot, options = {}) {
  const highlightEligible = options.highlightEligible ?? true;
  const isSelected = Boolean(options.selected);
  const isMuted = Boolean(options.muted);

  if (isSelected) {
    return { color: "#1c64f2", fillColor: "#1c64f2", fillOpacity: 0.32, opacity: 1, weight: 2.3 };
  }

  if (isMuted) {
    return { color: "#d8ddd8", fillColor: "#ffffff", fillOpacity: 0.04, opacity: 0.2, weight: 0.9 };
  }

  if (highlightEligible && lot.isEligible) {
    return { color: "#2e8a65", fillColor: "#2e8a65", fillOpacity: 0.22, opacity: 1, weight: 1.35 };
  }

  if (highlightEligible && !lot.isEligible) {
    return { color: "#ee8247", fillColor: "#ee8247", fillOpacity: 0.18, opacity: 1, weight: 1.25 };
  }

  return { color: "#f3c623", fillColor: "#f3c623", fillOpacity: 0.12, opacity: 1, weight: 1.15 };
}

function applyLotStyle(lot, options = {}) {
  if (!lot.layer) return;
  lot.layer.setStyle(lotFillStyle(lot, options));
  if (options.selected && lot.layer.bringToFront) {
    lot.layer.bringToFront();
  }
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

function ensureMap() {
  if (map) return map;
  if (!window.L) {
    throw new Error("Leaflet nao carregou corretamente.");
  }

  map = L.map(mapWrap, {
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: true,
    touchZoom: true,
    dragging: true,
    preferCanvas: true,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
  });

  mapTileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  map.on("zoomend", syncZoomFromMap);
  return map;
}

function clearMapLayers() {
  [boundaryLayer, ...roadLayers, ...lotLayers, ...labelLayers].forEach((layer) => {
    if (layer && map) {
      map.removeLayer(layer);
    }
  });
  boundaryLayer = null;
  roadLayers = [];
  lotLayers = [];
  labelLayers = [];
}

function syncZoomFromMap() {
  if (!map) return;
  const percent = 100 + (map.getZoom() - mapBaseZoom) * 10;
  zoomPercent = Math.max(Number(zoomRange.min), Math.min(Number(zoomRange.max), Math.round(percent)));
  zoomRange.value = String(zoomPercent);
}

function zoomPercentToLeafletZoom(percent) {
  const minZoom = 14;
  const maxZoom = 20.5;
  const nextZoom = mapBaseZoom + (Number(percent) - 100) / 10;
  return Math.max(minZoom, Math.min(maxZoom, nextZoom));
}

function fitMapToLand() {
  if (!map) return;
  const bounds = L.latLngBounds([
    [land.corners.topLeft.lat, land.corners.topLeft.lng],
    [land.corners.topRight.lat, land.corners.topRight.lng],
    [land.corners.bottomRight.lat, land.corners.bottomRight.lng],
    [land.corners.bottomLeft.lat, land.corners.bottomLeft.lng],
  ]);
  map.fitBounds(bounds, { padding: [24, 24] });
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

function syncVerticalRoadPosition(value) {
  const normalized = ["start", "center", "end"].includes(value) ? value : "center";
  verticalRoadPositionInput.value = normalized;
  land.verticalRoadPosition = normalized;
  refreshLandMetrics();
  return normalized;
}

function populateRowFilter(selected = rowFilter.value) {
  const current = selected || "all";
  rowFilter.innerHTML = '<option value="all">Todas as fileiras</option>';
  for (let row = 1; row <= land.rows; row += 1) {
    const option = document.createElement("option");
    option.value = String(row);
    option.textContent = rowLabelFor(row);
    rowFilter.appendChild(option);
  }

  if ([...rowFilter.options].some((option) => option.value === current)) {
    rowFilter.value = current;
  } else {
    rowFilter.value = "all";
  }
}

function updateSummary() {
  summaryTotalArea.textContent = `${formatArea(land.totalArea)} m\u00b2`;
  summaryRoadCount.textContent = `${land.horizontalRoads + 1} ruas`;
  summaryRoadArea.textContent = `\u00c1rea das ruas: ${formatAreaSmart(land.roadArea)} m\u00b2 | 3 horizontais + 1 vertical (${land.verticalRoadPosition})`;
  summaryLotCount.textContent = String(layout.totalLots);
  summaryUsableArea.textContent = `\u00c1rea \u00fatil: ${formatArea(land.usableArea)} m\u00b2`;
  summaryFrontage.textContent = `${formatMeters(layout.minFrontage)} m | real ${formatMeters(layout.minFrontageActual)}-${formatMeters(layout.maxFrontageActual)} m`;
  summaryMinArea.textContent = `M\u00ednimo definido: ${formatAreaSmart(layout.minArea)} m\u00b2 | Lote calculado: ${formatArea(layout.averageArea)} m\u00b2`;
  if (mobileTotalArea) mobileTotalArea.textContent = `${formatArea(land.totalArea)} m\u00b2`;
  if (mobileLotArea) mobileLotArea.textContent = `${formatArea(layout.averageArea)} m\u00b2`;
  if (mobileLotCount) mobileLotCount.textContent = String(layout.totalLots);
  if (mobileFrontage) mobileFrontage.textContent = `${formatMeters(layout.minFrontage)} m`;
}

function updateZoom(nextZoom) {
  zoomPercent = Math.max(Number(zoomRange.min), Math.min(Number(zoomRange.max), Math.round(nextZoom)));
  zoomRange.value = String(zoomPercent);
  const activeMap = mapViewModeInput?.value === "real" ? realMap : svg;
  if (activeMap) {
    activeMap.style.width = `${zoomPercent}%`;
  }
}

function setMapViewMode(mode) {
  const normalized = mode === "real" ? "real" : "simulada";
  if (mapViewModeInput && mapViewModeInput.value !== normalized) {
    mapViewModeInput.value = normalized;
  }

  mapWrap.classList.toggle("is-real", normalized === "real");

  if (normalized === "real") {
    svg.hidden = true;
    if (realMap) {
      realMap.hidden = false;
      realMap.src = realMapEmbedUrl();
      realMap.style.width = `${zoomPercent}%`;
    }
    return;
  }

  if (realMap) {
    realMap.hidden = true;
    realMap.removeAttribute("src");
  }
  svg.hidden = false;
  svg.style.width = `${zoomPercent}%`;
}

function buildLots() {
  lots.length = 0;
  lotsById.clear();
  let number = 1;

  for (let row = 1; row <= land.rows; row += 1) {
    for (let col = 1; col <= layout.lotBands.length; col += 1) {
      const [x0, x1] = layout.lotBands[col - 1];
      const y0x0 = yFor(row, "bottom", x0);
      const y0x1 = yFor(row, "bottom", x1);
      const y1x1 = yFor(row, "top", x1);
      const y1x0 = yFor(row, "top", x0);
      const centerX = (x0 + x1) / 2;
      const centerY = (yFor(row, "bottom", centerX) + yFor(row, "top", centerX)) / 2;
      const coords = metersToCoordinate(centerX, centerY);
      const geoPoints = localPointsToLatLng([
        [x0, y0x0],
        [x1, y0x1],
        [x1, y1x1],
        [x0, y1x0],
      ]);
      const area = areaForLot(x0, x1);
      const frontage = x1 - x0;
      const meetsMinArea = area + 1e-6 >= layout.minArea;
      const meetsMinFrontage = frontage + 1e-6 >= layout.minFrontage;

      lots.push({
        id: `F${row}-${String(col).padStart(2, "0")}`,
        number,
        row,
        col,
        side: x1 <= land.verticalRoadStart ? "left" : "right",
        x0,
        x1,
        centerX,
        centerY,
        lotWidth: frontage,
        depthStart: y1x0 - y0x0,
        depthEnd: y1x1 - y0x1,
        depthAvg: rowHeightAt(centerX),
        area,
        meetsMinArea,
        meetsMinFrontage,
        isEligible: meetsMinArea && meetsMinFrontage,
        lat: coords.lat,
        lng: coords.lng,
        points: [
          [x0, y0x0],
          [x1, y0x1],
          [x1, y1x1],
          [x0, y1x0],
        ],
        geoPoints,
        geoCenter: [coords.lat, coords.lng],
      });

      lotsById.set(`F${row}-${String(col).padStart(2, "0")}`, lots[lots.length - 1]);

      number += 1;
    }
  }
}

function drawBaseMap() {
  svg.setAttribute("viewBox", `0 0 ${rasterScene.width} ${rasterScene.height}`);
  svg.setAttribute("aria-label", `Mapa interativo com ${layout.totalLots} lotes`);
  svg.innerHTML = "";

  const defs = createSvgElement("defs");
  defs.innerHTML = `
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#102017" flood-opacity="0.35"></feDropShadow>
    </filter>
  `;
  svg.appendChild(defs);

  const background = createSvgElement("image", {
    href: "assets/referencia-fundo-mapa.png",
    x: "0",
    y: "0",
    width: String(rasterScene.width),
    height: String(rasterScene.height),
    preserveAspectRatio: "none",
  });
  svg.appendChild(background);

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

  for (let index = 1; index <= land.horizontalRoads; index += 1) {
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
  }

  const road = land.verticalRoad ?? resolveVerticalRoad();
  const roadStrip = createSvgElement("polygon", {
    class: "road road-vertical",
    points: polygonPoints([
      [road.start, 0],
      [road.end, 0],
      [road.end, widthAt(road.end)],
      [road.start, widthAt(road.start)],
    ]),
  });
  svg.appendChild(roadStrip);

  for (let index = 1; index <= land.horizontalRoads; index += 1) {
    const labelPoint = screenFromLocal(
      land.length / 2,
      (roadY(index, "bottom", land.length / 2) + roadY(index, "top", land.length / 2)) / 2,
    );
    const label = createSvgElement("text", {
      class: "road-label",
      x: labelPoint.x,
      y: labelPoint.y + 4,
    });
    label.textContent = `Rua ${index} - 10 m`;
    svg.appendChild(label);
  }

  const roadPoint = screenFromLocal((road.start + road.end) / 2, widthAt((road.start + road.end) / 2) / 2);
  const roadLabel = createSvgElement("text", {
    class: "road-label road-label-vertical",
    x: roadPoint.x + 12,
    y: roadPoint.y,
    transform: `rotate(-90 ${roadPoint.x + 12} ${roadPoint.y})`,
  });
  roadLabel.textContent = "Rua vertical - 10 m";
  svg.appendChild(roadLabel);
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
    const point = screenFromLocal(x, y);
    const label = createSvgElement("text", {
      class: "row-label",
      x: point.x,
      y: point.y + 3,
    });
    label.textContent = rowLabelFor(row);
    svg.appendChild(label);
  }

  const depthPoint = screenFromLocal(land.length / 2, land.frontWidth + 11);
  const depthLabel = createSvgElement("text", {
    class: "axis-label",
    x: depthPoint.x,
    y: depthPoint.y,
  });
  depthLabel.textContent = "Profundidade 400 m";
  svg.appendChild(depthLabel);

  const backPoint = screenFromLocal(-8, land.backWidth / 2);
  const backLabel = createSvgElement("text", {
    class: "axis-label",
    x: backPoint.x,
    y: backPoint.y,
    transform: `rotate(-90 ${backPoint.x} ${backPoint.y})`,
  });
  backLabel.textContent = "Fundo 113 m";
  svg.appendChild(backLabel);

  const frontPoint = screenFromLocal(land.length + 8, land.frontWidth / 2);
  const frontLabel = createSvgElement("text", {
    class: "axis-label",
    x: frontPoint.x,
    y: frontPoint.y,
    transform: `rotate(90 ${frontPoint.x} ${frontPoint.y})`,
  });
  frontLabel.textContent = "Frente 161 m";
  svg.appendChild(frontLabel);
}

function updateLotClasses() {
  const filter = rowFilter.value;
  const highlightEligible = highlightEligibleInput?.checked;
  svg.querySelectorAll(".lot").forEach((shape) => {
    const lot = lotsById.get(shape.dataset.id);
    const isSelected = selectedLot && shape.dataset.id === selectedLot.id;
    const isMuted = filter !== "all" && shape.dataset.row !== filter;
    const isEligible = Boolean(lot?.isEligible);
    shape.classList.toggle("is-selected", isSelected);
    shape.classList.toggle("is-muted", isMuted);
    shape.classList.toggle("is-eligible", highlightEligible && isEligible && !isSelected);
    shape.classList.toggle("is-below-min", highlightEligible && !isEligible && !isSelected);
  });
}

function renderDetails(lot) {
  const maps = mapsUrl(lot.lat, lot.lng);
  const directions = mapsDirectionsUrl(lot.lat, lot.lng);
  const html = `
    <div>
      <small>Lote selecionado</small>
      <h3>${lot.id} <span class="lot-number">#${lot.number}</span></h3>
      <small>Malha global: ${layout.totalLots} lotes | lote calculado: ${formatArea(layout.averageArea)} m\u00b2</small>
    </div>
    <div class="status-bar">
      <span class="${lot.isEligible ? "status-ok" : "status-warn"}">
        ${lot.isEligible ? "Atende a regra global" : "Abaixo da regra global"}
      </span>
      <span>${formatArea(lot.area)} m\u00b2</span>
      <span>${formatMeters(lot.lotWidth)} m</span>
    </div>
    <div class="detail-grid">
      <div><span>Fileira</span><strong>${lot.row}</strong></div>
      <div><span>Posi\u00e7\u00e3o</span><strong>${lot.col}/${layout.columns}</strong></div>
      <div class="metric-primary"><span>Frente</span><strong>${formatMeters(lot.lotWidth)} m</strong></div>
      <div class="metric-primary"><span>Prof. m\u00e9dia</span><strong>${formatMeters(lot.depthAvg)} m</strong></div>
      <div><span>Profundidade no in\u00edcio</span><strong>${formatMeters(lot.depthStart)} m</strong></div>
      <div><span>Profundidade no fim</span><strong>${formatMeters(lot.depthEnd)} m</strong></div>
      <div class="metric-primary"><span>\u00c1rea estimada</span><strong>${formatArea(lot.area)} m\u00b2</strong></div>
      <div><span>Coordenada</span><strong>${lot.lat.toFixed(5)}, ${lot.lng.toFixed(5)}</strong></div>
    </div>
    <div class="detail-actions">
      <a href="${maps}" target="_blank" rel="noreferrer">Ver este lote no Google Maps</a>
      <a href="${directions}" target="_blank" rel="noreferrer">Tra\u00e7ar rota at\u00e9 o lote</a>
    </div>
    <small>A frente cresce quando o m\u00ednimo sobe. A \u00e1rea total continua sendo preenchida sem sobras.</small>
  `;
  details.innerHTML = html;
  const mobileDetails = document.querySelector("#lotDetailsMobile");
  if (mobileDetails) {
    mobileDetails.innerHTML = html;
  }
}

function selectLot(id, options = {}) {
  const lot = lots.find((item) => item.id === id || String(item.number) === String(id));
  if (!lot) {
    details.innerHTML = "<p>N\u00e3o encontrei esse lote. Tente algo como 124 ou F3-14.</p>";
    return;
  }

  selectedLot = lot;
  searchInput.value = lot.id;
  updateLotClasses();
  renderDetails(lot);

  const selectedShape = svg.querySelector(`[data-id="${lot.id}"]`);
  if (options.pan !== false) {
    selectedShape?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
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
  refreshLandMetrics();
  populateRowFilter(rowFilter.value);
  layout = computeLayout(minArea, layout?.minFrontage ?? 10);
  updateSummary();
  buildLots();
  drawBaseMap();
  drawLots();
  updateLotClasses();

  const nextId = previousId && lots.some((lot) => lot.id === previousId) ? previousId : "F1-01";
  selectLot(nextId, { pan: false });
}

function runSearch() {
  const value = normalizeSearch(searchInput.value);
  selectLot(value);
}

function init() {
  refreshLandMetrics();
  populateRowFilter();
  const minArea = syncMinArea(minAreaInput.value);
  const minFrontage = syncMinFrontage(minFrontageInput.value);
  syncVerticalRoadPosition(verticalRoadPositionInput.value);
  layout = computeLayout(minArea, minFrontage);
  updateSummary();
  buildLots();
  drawBaseMap();
  drawLots();
  setMapViewMode(mapViewModeInput?.value ?? "simulada");
  updateZoom(100);
  selectLot("F1-01", { pan: false });

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
    selectLot(selectedLot?.id ?? "F1-01", { pan: false });
  };

  minAreaInput.addEventListener("input", (event) => onMinAreaChange(event.target.value));
  minAreaRange.addEventListener("input", (event) => onMinAreaChange(event.target.value));
  minFrontageInput.addEventListener("input", (event) => onMinFrontageChange(event.target.value));
  minFrontageRange.addEventListener("input", (event) => onMinFrontageChange(event.target.value));
  verticalRoadPositionInput.addEventListener("change", (event) => {
    syncVerticalRoadPosition(event.target.value);
    rebuildLayout(layout?.minArea ?? Number(minAreaInput.value));
  });
  highlightEligibleInput.addEventListener("change", () => {
    updateLotClasses();
    renderDetails(selectedLot ?? lots[0]);
  });

  zoomRange.addEventListener("input", (event) => updateZoom(Number(event.target.value)));
  zoomOut.addEventListener("click", () => updateZoom(zoomPercent - 10));
  zoomIn.addEventListener("click", () => updateZoom(zoomPercent + 10));
  zoomReset.addEventListener("click", () => updateZoom(100));
  mapViewModeInput?.addEventListener("change", (event) => {
    setMapViewMode(event.target.value);
  });

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
