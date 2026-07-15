const DATA = {
  h3: "data/h3_cells.geojson",
  comunas: "data/comunas.geojson",
  stations: "data/metro_stations.geojson",
  metro: "data/metro_segments.geojson",
  od: "data/od_corridors.geojson",
  summary: "data/summary.json",
};

const PRIORITY_COLORS = {
  "Baja demanda local": "#263238",
  "Demanda con acceso Metro": "#45b5d9",
  "Brecha fuera de 1000 m": "#ffb36b",
  "Candidato piloto Metro": "#1e8fb8",
  "Brecha alimentador nocturno": "#e86f1d",
  "Estación crítica": "#6531a6",
};

const LISA_COLORS = {
  HH: "#e66b1f",
  LL: "#2ca987",
  HL: "#756bb1",
  LH: "#e3b51b",
  "No significativo": "#dfe5e8",
};

const METRO_COLORS = {
  L1: "#e2231a",
  L2: "#f4c430",
  L3: "#8f5a2a",
  L4: "#2368b4",
  L4A: "#35a8e0",
  L5: "#34a853",
  L6: "#8d4bb3",
  L7: "#888888",
};

const OD_COLORS = [
  "#ff4d6d",
  "#f77f00",
  "#ffb703",
  "#2ec4b6",
  "#00a6fb",
  "#5e60ce",
  "#9b5de5",
  "#f15bb5",
  "#7bdff2",
  "#80ed99",
];

const state = {
  mode: "priority",
  scenario: "total",
  opacity: 0.76,
  odLimit: 30,
  activeODRank: null,
  selectedIds: new Set(),
  featureById: new Map(),
  elementById: new Map(),
  odFeatures: [],
  summary: null,
  projectedBounds: null,
  viewBox: null,
  drag: null,
};

const svg = document.getElementById("mapSvg");
const viewport = document.getElementById("mapViewport");
const groups = {
  comunas: document.getElementById("comunaGroup"),
  h3: document.getElementById("h3Group"),
  od: document.getElementById("odGroup"),
  metro: document.getElementById("metroGroup"),
  stations: document.getElementById("stationGroup"),
};
const tooltip = document.getElementById("hoverTooltip");

const fmt0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const SVG_NS = "http://www.w3.org/2000/svg";
const PROJ_SCALE = 100000;
const PROJ_COS = Math.cos((-33.45 * Math.PI) / 180);

function number(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return decimals ? fmt1.format(n) : fmt0.format(n);
}

function pct(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${decimals ? fmt1.format(n) : fmt0.format(n)}%`;
}

function createSvg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function project(coord) {
  const [lon, lat] = coord;
  return [lon * PROJ_COS * PROJ_SCALE, -lat * PROJ_SCALE];
}

function extendBounds(bounds, point) {
  bounds.minX = Math.min(bounds.minX, point[0]);
  bounds.minY = Math.min(bounds.minY, point[1]);
  bounds.maxX = Math.max(bounds.maxX, point[0]);
  bounds.maxY = Math.max(bounds.maxY, point[1]);
}

function geometryBounds(geometry, bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }) {
  const visit = (coords) => {
    if (typeof coords[0] === "number") {
      extendBounds(bounds, project(coords));
    } else {
      coords.forEach(visit);
    }
  };
  visit(geometry.coordinates);
  return bounds;
}

function pathFromGeometry(geometry) {
  const ringPath = (ring) =>
    ring
      .map((coord, index) => {
        const [x, y] = project(coord);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ") + " Z";

  const linePath = (coords) =>
    coords
      .map((coord, index) => {
        const [x, y] = project(coord);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  if (geometry.type === "Polygon") return geometry.coordinates.map(ringPath).join(" ");
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((poly) => poly.map(ringPath)).join(" ");
  if (geometry.type === "LineString") return linePath(geometry.coordinates);
  if (geometry.type === "MultiLineString") return geometry.coordinates.map(linePath).join(" ");
  return "";
}

function pointFromGeometry(geometry) {
  return project(geometry.coordinates);
}

function metricForScenario() {
  if (state.scenario === "laboral") return "viajes_total_dia_laboral";
  if (state.scenario === "fin_semana") return "viajes_total_dia_fin_semana";
  return "viajes_total_dia_promedio";
}

function metricLabel() {
  if (state.scenario === "laboral") return "viajes laborales/día";
  if (state.scenario === "fin_semana") return "viajes fin de semana/día";
  return "viajes promedio/día";
}

function colorRamp(value, metric, palette) {
  const q = state.summary?.metricas?.[metric];
  const n = Number(value);
  if (!q || !Number.isFinite(n) || n <= 0) return palette[0];
  if (n <= q.p50) return palette[1];
  if (n <= q.p75) return palette[2];
  if (n <= q.p90) return palette[3];
  if (n <= q.p95) return palette[4];
  return palette[5];
}

function residualColor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "#313a40";
  if (n < -1.5) return "#2b5c9e";
  if (n < -0.5) return "#75aadb";
  if (n <= 0.5) return "#edf3f8";
  if (n <= 1.5) return "#f5a45b";
  return "#c7352e";
}

function accessColor(p) {
  const dist = Number(p.dist_metro_m);
  if (Number(p.n_estaciones_riel) > 0) return "#673ab7";
  if (!Number.isFinite(dist)) return "#4a545b";
  if (dist <= 800) return "#2f9ed2";
  if (dist <= 1000) return "#72c7df";
  if (dist <= 2000) return "#ffb36b";
  return "#d94801";
}

function fillColor(feature) {
  const p = feature.properties;
  const metric = metricForScenario();
  if (state.mode === "priority") return PRIORITY_COLORS[p.categoria_prioridad] || "#465057";
  if (state.mode === "demand") {
    return colorRamp(p[metric], metric, ["#eef2f3", "#bcdce9", "#79bbd4", "#2b8cbe", "#fdae61", "#d7191c"]);
  }
  if (state.mode === "rate") {
    return colorRamp(p.origen_por_1000_personas, "origen_por_1000_personas", [
      "#f3effa",
      "#d4c2eb",
      "#b48ad8",
      "#8856a7",
      "#dd3497",
      "#ae017e",
    ]);
  }
  if (state.mode === "access") return accessColor(p);
  if (state.mode === "lisa") return LISA_COLORS[p.lisa_cluster] || "#dfe5e8";
  if (state.mode === "beneficiaries") {
    return colorRamp(p.beneficiarios_tp, "beneficiarios_tp", [
      "#eef7f0",
      "#cbeccf",
      "#90d79c",
      "#4caf62",
      "#238b45",
      "#005a32",
    ]);
  }
  if (state.mode === "ols") return residualColor(p.residuos_ols_h3);
  return "#6baed6";
}

function styleH3Element(el, feature) {
  const p = feature.properties;
  const isSelected = state.selectedIds.has(p.h3_cell_id);
  const priorityOnly = document.getElementById("togglePriorityOnly")?.checked;
  const isPriority = Number(p.es_celda_prioritaria) === 1;
  const muted = priorityOnly && !isPriority;
  el.setAttribute("fill", fillColor(feature));
  el.setAttribute("fill-opacity", muted ? 0.035 : state.opacity);
  el.setAttribute("stroke", isSelected ? "#ffffff" : isPriority ? "rgba(255,255,255,0.66)" : "rgba(255,255,255,0.18)");
  el.setAttribute("stroke-width", isSelected ? "2.4" : isPriority ? "0.7" : "0.35");
  el.setAttribute("opacity", muted ? "0.16" : "1");
  el.setAttribute("vector-effect", "non-scaling-stroke");
}

function lineColor(line) {
  const first = String(line || "").split(";")[0].trim();
  return METRO_COLORS[first] || "#8aa2ad";
}

function odColor(rank) {
  const index = Math.max(0, Number(rank || 1) - 1) % OD_COLORS.length;
  return OD_COLORS[index];
}

function odMidpoint(geometry) {
  const coords = geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates?.[0] || [];
  if (!coords.length) return [0, 0];
  if (coords.length === 1) return project(coords[0]);
  const points = coords.map(project);
  const segments = points.slice(1).map((point, index) => {
    const prev = points[index];
    return { prev, point, length: Math.hypot(point[0] - prev[0], point[1] - prev[1]) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let target = total / 2;
  for (const segment of segments) {
    if (target <= segment.length) {
      const t = segment.length === 0 ? 0 : target / segment.length;
      return [
        segment.prev[0] + (segment.point[0] - segment.prev[0]) * t,
        segment.prev[1] + (segment.point[1] - segment.prev[1]) * t,
      ];
    }
    target -= segment.length;
  }
  return points[Math.floor(points.length / 2)];
}

function setActiveODRank(rank) {
  state.activeODRank = rank;
  groups.od.querySelectorAll(".od-corridor").forEach((group) => {
    const isActive = Number(group.dataset.rank) === Number(rank);
    group.classList.toggle("active", isActive);
    group.classList.toggle("dimmed", rank !== null && !isActive);
  });
}

function categoryTagColor(category) {
  return PRIORITY_COLORS[category] || "#9fb2bd";
}

function tooltipHtml(p) {
  const metric = metricForScenario();
  const olsRow = state.mode === "ols"
    ? `<span>Residuo OLS contextual</span><b>${number(p.residuos_ols_h3, 2)}</b>`
    : "";
  return `
    <div class="tooltip-card">
      <span class="tag" style="background:${categoryTagColor(p.categoria_prioridad)}">${p.categoria_prioridad_label || p.categoria_prioridad || "Sin categoría"}</span>
      <h3>${p.comuna || "Comuna no asignada"} · H3 ${p.h3_short}</h3>
      <div class="tooltip-table">
        <span>${metricLabel()}</span><b>${number(p[metric], 1)}</b>
        <span>Población censal</span><b>${number(p.poblacion_total)}</b>
        <span>Usuarios TP censales</span><b>${number(p.beneficiarios_tp)}</b>
        <span>Origen / 1000 pers.</span><b>${number(p.origen_por_1000_personas, 1)}</b>
        <span>Distancia Metro</span><b>${number(p.dist_metro_m)} m</b>
        <span>LISA</span><b>${p.lisa_cluster || "Sin dato"}</b>
        ${olsRow}
      </div>
    </div>`;
}

function showTooltip(html, event) {
  tooltip.innerHTML = html;
  tooltip.style.display = "block";
  moveTooltip(event);
}

function moveTooltip(event) {
  const rect = document.getElementById("map").getBoundingClientRect();
  tooltip.style.left = `${event.clientX - rect.left}px`;
  tooltip.style.top = `${event.clientY - rect.top}px`;
}

function hideTooltip() {
  tooltip.style.display = "none";
}

function aggregate(features) {
  const rows = features.map((f) => f.properties);
  const sum = (key) => rows.reduce((acc, p) => acc + (Number(p[key]) || 0), 0);
  const demandMetric = metricForScenario();
  const demandWeight = sum(demandMetric);
  const weightedDist = demandWeight
    ? rows.reduce((acc, p) => acc + (Number(p.dist_metro_m) || 0) * (Number(p[demandMetric]) || 0), 0) / demandWeight
    : 0;
  return {
    celdas: rows.length,
    poblacion: sum("poblacion_total"),
    beneficiarios_tp: sum("beneficiarios_tp"),
    viajes_total_dia_promedio: sum("viajes_total_dia_promedio"),
    viajes_total_dia_laboral: sum("viajes_total_dia_laboral"),
    viajes_total_dia_fin_semana: sum("viajes_total_dia_fin_semana"),
    demanda_potencial_metro: sum("demanda_potencial_metro"),
    demanda_potencial_alimentador: sum("demanda_potencial_alimentador"),
    estaciones: sum("n_estaciones_riel"),
    dist_metro_m_pond_viajes: weightedDist,
    cerca1000: rows.filter((p) => Number(p.tiene_metro_1000m) === 1).length,
  };
}

function metricBlock(value, label, decimals = 0) {
  return `<article class="metric"><strong>${number(value, decimals)}</strong><small>${label}</small></article>`;
}

function updateDetailForAggregate(title, stats, contextText) {
  document.getElementById("detailTitle").textContent = title;
  document.getElementById("detailGrid").innerHTML = [
    metricBlock(stats.celdas, "celdas H3-8"),
    metricBlock(stats.poblacion, "población censal"),
    metricBlock(stats.beneficiarios_tp, "usuarios TP censales"),
    metricBlock(stats[metricForScenario()] ?? stats.viajes_total_dia_promedio, metricLabel(), 1),
    metricBlock(stats.demanda_potencial_metro, "demanda cerca de Metro", 1),
    metricBlock(stats.demanda_potencial_alimentador, "demanda de brecha", 1),
    metricBlock(stats.estaciones, "estaciones en celdas"),
    metricBlock(stats.dist_metro_m_pond_viajes, "distancia Metro ponderada", 0),
  ].join("");
  document.getElementById("detailText").innerHTML = contextText;
}

function updateDefaultDetail() {
  const total = state.summary.totales;
  const priority = state.summary.prioritarias;
  const metric = metricForScenario();
  const demandShare = (priority[metric] / total[metric]) * 100;
  updateDetailForAggregate("Celdas prioritarias", priority, `
    <b>${pct(demandShare, 1)}</b> de la demanda nocturna no Metro del marco urbano se concentra en celdas prioritarias.
    La estimación de beneficiarios usa residentes censales que declaran transporte público como modo habitual.
  `);
}

function updateDetailForFeature(feature) {
  const p = feature.properties;
  const stats = aggregate([feature]);
  const intervention =
    p.categoria_prioridad === "Brecha alimentador nocturno" || p.categoria_prioridad === "Brecha fuera de 1000 m"
      ? "La lectura principal es de cobertura: alta actividad fuera del radio caminable de 1000 m, candidata a alimentador nocturno o conexión complementaria."
      : p.categoria_prioridad === "Candidato piloto Metro" || p.categoria_prioridad === "Estación crítica"
        ? "La lectura principal es de operación: alta demanda asociada a estaciones o tramos existentes, candidata a piloto Metro nocturno focalizado."
        : "La celda aporta contexto territorial, pero no aparece como prioridad fuerte bajo los criterios actuales.";
  updateDetailForAggregate(`${p.comuna || "Santiago"} · H3 ${p.h3_short}`, stats, `
    <b>${p.categoria_prioridad_label || p.categoria_prioridad || "Sin categoría"}.</b>
    ${intervention}
    LISA: <b>${p.lisa_cluster || "sin dato"}</b>; distancia a Metro: <b>${number(p.dist_metro_m)} m</b>.
  `);
}

function updateDetailForSelection() {
  if (!state.selectedIds.size) {
    updateDefaultDetail();
    return;
  }
  const features = [...state.selectedIds].map((id) => state.featureById.get(id)).filter(Boolean);
  const stats = aggregate(features);
  const nearShare = stats.celdas ? (stats.cerca1000 / stats.celdas) * 100 : 0;
  updateDetailForAggregate(`Selección · ${stats.celdas} celdas`, stats, `
    En la selección, <b>${pct(nearShare, 1)}</b> de las celdas está a 1000 m o menos de una estación.
    La demanda se separa entre potencialmente servible por Metro y brechas que sugieren alimentadores nocturnos.
  `);
}

function renderH3(features) {
  groups.h3.replaceChildren();
  features.forEach((feature) => {
    const p = feature.properties;
    const path = createSvg("path", {
      class: "h3-cell",
      d: pathFromGeometry(feature.geometry),
      "data-id": p.h3_cell_id,
    });
    state.featureById.set(p.h3_cell_id, feature);
    state.elementById.set(p.h3_cell_id, path);
    styleH3Element(path, feature);
    path.addEventListener("mouseenter", (event) => {
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", "2.2");
      showTooltip(tooltipHtml(p), event);
      updateDetailForFeature(feature);
    });
    path.addEventListener("mousemove", moveTooltip);
    path.addEventListener("mouseleave", () => {
      styleH3Element(path, feature);
      hideTooltip();
      if (state.selectedIds.size) updateDetailForSelection();
    });
    path.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.selectedIds.has(p.h3_cell_id)) state.selectedIds.delete(p.h3_cell_id);
      else state.selectedIds.add(p.h3_cell_id);
      styleH3Element(path, feature);
      updateDetailForSelection();
    });
    groups.h3.appendChild(path);
  });
}

function renderComunas(features) {
  groups.comunas.replaceChildren();
  features.forEach((feature) => {
    groups.comunas.appendChild(
      createSvg("path", {
        class: "comuna-path",
        d: pathFromGeometry(feature.geometry),
        "vector-effect": "non-scaling-stroke",
      }),
    );
  });
}

function renderMetro(features) {
  groups.metro.replaceChildren();
  // La secuencia GTFS reconstruye pares aproximados, no geometria oficial de vias.
  // Para evitar insinuar tramos no contiguos, la app usa estaciones como referencia Metro.
  void features;
  return;
  features.forEach((feature) => {
    const p = feature.properties;
    const selected = p.es_tramo_colindante_top10 === true;
    const path = createSvg("path", {
      class: `metro-line${selected ? " colindante" : ""}`,
      d: pathFromGeometry(feature.geometry),
      stroke: lineColor(p.linea),
      "stroke-width": selected ? "5" : "2.2",
      "vector-effect": "non-scaling-stroke",
    });
    path.addEventListener("mouseenter", (event) => {
      showTooltip(`<div class="tooltip-card"><h3>${p.tramo_metro || `${p.estacion_a} - ${p.estacion_b}`}</h3><div class="tooltip-table"><span>Línea</span><b>${p.linea || "--"}</b><span>Relación OD</span><b>${selected ? "Top 10" : "red completa"}</b></div></div>`, event);
    });
    path.addEventListener("mousemove", moveTooltip);
    path.addEventListener("mouseleave", hideTooltip);
    groups.metro.appendChild(path);
  });
}

function renderStations(features) {
  groups.stations.replaceChildren();
  features.forEach((feature) => {
    const p = feature.properties;
    const [x, y] = pointFromGeometry(feature.geometry);
    const selected = p.es_estacion_colindante_top10 === true;
    const dot = createSvg("circle", {
      class: `station-dot${selected ? " colindante" : ""}`,
      cx: x,
      cy: y,
      r: selected ? 92 : 58,
      "vector-effect": "non-scaling-stroke",
    });
    dot.addEventListener("mouseenter", (event) => {
      showTooltip(`<div class="tooltip-card"><h3>${p.nombre_estacion}</h3><div class="tooltip-table"><span>Líneas</span><b>${p.lineas_metro || "--"}</b><span>OD top 10</span><b>${selected ? "Sí" : "No"}</b></div></div>`, event);
    });
    dot.addEventListener("mousemove", moveTooltip);
    dot.addEventListener("mouseleave", hideTooltip);
    groups.stations.appendChild(dot);
  });
}

function renderOD(features) {
  groups.od.replaceChildren();
  const maxValue = Math.max(...features.map((f) => Number(f.properties.viajes_sin_metro_fuera_horario_dia_promedio) || 0), 1);
  const visibleFeatures = features.filter((feature) => Number(feature.properties.rank_corredor || 0) <= state.odLimit);
  const orderedFeatures = visibleFeatures.sort((a, b) => Number(b.properties.rank_corredor || 0) - Number(a.properties.rank_corredor || 0));
  orderedFeatures.forEach((feature) => {
    const p = feature.properties;
    const rank = Number(p.rank_corredor || 0);
    const value = Number(p.viajes_sin_metro_fuera_horario_dia_promedio) || 0;
    const width = 1.25 + 6.8 * Math.sqrt(value / maxValue);
    const d = pathFromGeometry(feature.geometry);
    const group = createSvg("g", {
      class: "od-corridor",
      "data-rank": rank,
    });
    const halo = createSvg("path", {
      class: "od-halo",
      d,
      "stroke-width": (width + 5.2).toFixed(2),
      "vector-effect": "non-scaling-stroke",
    });
    const path = createSvg("path", {
      class: `od-line${rank <= 10 ? " top-ten" : ""}`,
      d,
      stroke: odColor(rank),
      "stroke-width": width.toFixed(2),
      "vector-effect": "non-scaling-stroke",
    });
    group.appendChild(halo);
    group.appendChild(path);

    if (rank <= 10) {
      const [x, y] = odMidpoint(feature.geometry);
      const label = createSvg("g", {
        class: "od-rank-label",
        transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`,
      });
      label.appendChild(createSvg("circle", { r: "105", "vector-effect": "non-scaling-stroke" }));
      const text = createSvg("text", {
        "text-anchor": "middle",
        "dominant-baseline": "central",
      });
      text.textContent = rank;
      label.appendChild(text);
      group.appendChild(label);
    }
    group.addEventListener("mouseenter", (event) => {
      setActiveODRank(rank);
      showTooltip(`<div class="tooltip-card"><h3>${p.rank_corredor}. ${p.corredor_presentacion}</h3><div class="tooltip-table"><span>Viajes/día</span><b>${number(value, 1)}</b><span>Distancia</span><b>${number(p.distancia_km, 1)} km</b></div></div>`, event);
    });
    group.addEventListener("mousemove", moveTooltip);
    group.addEventListener("mouseleave", () => {
      setActiveODRank(null);
      hideTooltip();
    });
    groups.od.appendChild(group);
  });
}

function refreshH3Styles() {
  state.elementById.forEach((el, id) => styleH3Element(el, state.featureById.get(id)));
  renderLegend();
}

function setLayerVisibility() {
  groups.comunas.style.display = document.getElementById("toggleComunas").checked ? "" : "none";
  groups.metro.style.display = document.getElementById("toggleMetro").checked ? "" : "none";
  groups.stations.style.display = document.getElementById("toggleMetro").checked ? "" : "none";
  groups.od.style.display = document.getElementById("toggleOD").checked ? "" : "none";
}

function fitProjectedBounds(bounds, pad = 0.06) {
  const rect = svg.getBoundingClientRect();
  const aspect = rect.width / Math.max(rect.height, 1);
  let width = bounds.maxX - bounds.minX;
  let height = bounds.maxY - bounds.minY;
  let cx = (bounds.minX + bounds.maxX) / 2;
  let cy = (bounds.minY + bounds.maxY) / 2;
  width *= 1 + pad * 2;
  height *= 1 + pad * 2;
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;
  state.viewBox = { x: cx - width / 2, y: cy - height / 2, w: width, h: height };
  applyViewBox();
}

function applyViewBox() {
  const v = state.viewBox;
  svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
}

function eventToSvgPoint(event) {
  const rect = svg.getBoundingClientRect();
  return [
    state.viewBox.x + ((event.clientX - rect.left) / rect.width) * state.viewBox.w,
    state.viewBox.y + ((event.clientY - rect.top) / rect.height) * state.viewBox.h,
  ];
}

function setupMapNavigation() {
  const mapEl = document.getElementById("map");
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    const [mx, my] = eventToSvgPoint(event);
    const factor = event.deltaY > 0 ? 1.16 : 0.86;
    const nextW = state.viewBox.w * factor;
    const nextH = state.viewBox.h * factor;
    state.viewBox.x = mx - ((mx - state.viewBox.x) / state.viewBox.w) * nextW;
    state.viewBox.y = my - ((my - state.viewBox.y) / state.viewBox.h) * nextH;
    state.viewBox.w = nextW;
    state.viewBox.h = nextH;
    applyViewBox();
  }, { passive: false });

  svg.addEventListener("pointerdown", (event) => {
    state.drag = { start: eventToSvgPoint(event), view: { ...state.viewBox } };
    mapEl.classList.add("dragging");
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", (event) => {
    if (!state.drag) return;
    const now = eventToSvgPoint(event);
    state.viewBox.x = state.drag.view.x - (now[0] - state.drag.start[0]);
    state.viewBox.y = state.drag.view.y - (now[1] - state.drag.start[1]);
    applyViewBox();
  });
  svg.addEventListener("pointerup", (event) => {
    state.drag = null;
    mapEl.classList.remove("dragging");
    try {
      svg.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  });
  svg.addEventListener("click", () => {
    if (!state.selectedIds.size) updateDefaultDetail();
  });
}

function renderLegend() {
  const legend = document.getElementById("legend");
  let title = "";
  let rows = [];
  if (state.mode === "priority") {
    title = "Prioridad territorial";
    rows = Object.entries(PRIORITY_COLORS);
  } else if (state.mode === "demand") {
    title = `Demanda: ${metricLabel()}`;
    rows = [["Baja", "#eef2f3"], ["Media", "#79bbd4"], ["Alta", "#fdae61"], ["Muy alta", "#d7191c"]];
  } else if (state.mode === "rate") {
    title = "Orígenes por 1000 personas";
    rows = [["Baja", "#f3effa"], ["Media", "#b48ad8"], ["Alta", "#dd3497"], ["Muy alta", "#ae017e"]];
  } else if (state.mode === "access") {
    title = "Accesibilidad a Metro";
    rows = [["Celda con estación", "#673ab7"], ["<= 800 m", "#2f9ed2"], ["800-1000 m", "#72c7df"], ["1000-2000 m", "#ffb36b"], ["> 2000 m", "#d94801"]];
  } else if (state.mode === "lisa") {
    title = "LISA";
    rows = Object.entries(LISA_COLORS);
  } else if (state.mode === "beneficiaries") {
    title = "Usuarios censales de transporte público";
    rows = [["Bajo", "#eef7f0"], ["Medio", "#90d79c"], ["Alto", "#238b45"], ["Muy alto", "#005a32"]];
  } else {
    title = "Residuo OLS contextual";
    rows = [["Sobreestimado", "#2b5c9e"], ["Cercano a cero", "#edf3f8"], ["Subestimado", "#c7352e"]];
  }
  legend.innerHTML = `<h3>${title}</h3>${rows
    .map(([label, color]) => `<div class="legend-row"><span class="swatch" style="background:${color}"></span><span>${label}</span></div>`)
    .join("")}`;
}

function buildKpis() {
  const p = state.summary.prioritarias;
  const metric = metricForScenario();
  document.getElementById("kpiPriorityCells").textContent = number(p.celdas);
  document.getElementById("kpiPriorityPeople").textContent = number(p.poblacion);
  document.getElementById("kpiPriorityTp").textContent = number(p.beneficiarios_tp);
  document.getElementById("kpiPriorityDemand").textContent = number(p[metric] ?? p.viajes_total_dia_promedio, 1);
}

function buildClusterList() {
  const target = document.getElementById("clusterList");
  const clusters = state.summary.top_clusters || [];
  target.innerHTML = clusters
    .slice(0, 6)
    .map(
      (c) => `
      <button class="cluster-card" data-cluster="${c.cluster_prioridad}">
        <strong>Cluster ${c.cluster_prioridad}: ${c.categoria_dominante}</strong>
        <span>${number(c.poblacion_censo)} personas · ${number(c.viajes_total_por_1000_personas, 1)} viajes/1000 pers.</span>
      </button>`,
    )
    .join("");
  target.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => selectCluster(Number(btn.dataset.cluster)));
  });
}

function selectedFeaturesByCluster(clusterId) {
  return [...state.featureById.values()].filter((feature) => Number(feature.properties.cluster_prioridad) === clusterId);
}

function boundsForFeatures(features) {
  return features.reduce((bounds, feature) => geometryBounds(feature.geometry, bounds), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
}

function selectCluster(clusterId) {
  const features = selectedFeaturesByCluster(clusterId);
  state.selectedIds.clear();
  features.forEach((feature) => state.selectedIds.add(feature.properties.h3_cell_id));
  refreshH3Styles();
  fitProjectedBounds(boundsForFeatures(features), 0.24);
  updateDetailForSelection();
}

function zoomPriority() {
  const features = [...state.featureById.values()].filter((feature) => Number(feature.properties.es_celda_prioritaria) === 1);
  fitProjectedBounds(boundsForFeatures(features), 0.08);
}

function setupControls() {
  document.querySelectorAll("#layerMode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#layerMode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
      refreshH3Styles();
    });
  });

  document.querySelectorAll("#scenarioMode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#scenarioMode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.scenario = btn.dataset.scenario;
      document.querySelectorAll("#layerMode button").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === "demand");
      });
      state.mode = "demand";
      refreshH3Styles();
      buildKpis();
      if (state.selectedIds.size) updateDetailForSelection();
      else updateDefaultDetail();
    });
  });

  document.querySelectorAll("#odLimitMode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#odLimitMode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.odLimit = Number(btn.dataset.odLimit);
      renderOD(state.odFeatures);
    });
  });

  document.getElementById("opacitySlider").addEventListener("input", (event) => {
    state.opacity = Number(event.target.value) / 100;
    refreshH3Styles();
  });

  ["togglePriorityOnly", "toggleComunas", "toggleMetro", "toggleOD"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      refreshH3Styles();
      setLayerVisibility();
    });
  });

  document.getElementById("clearSelection").addEventListener("click", () => {
    state.selectedIds.clear();
    refreshH3Styles();
    updateDefaultDetail();
  });
  document.getElementById("zoomPriority").addEventListener("click", zoomPriority);
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function init() {
  const [h3, comunas, stations, metroSegments, od, summary] = await Promise.all([
    loadJson(DATA.h3),
    loadJson(DATA.comunas),
    loadJson(DATA.stations),
    loadJson(DATA.metro),
    loadJson(DATA.od),
    loadJson(DATA.summary),
  ]);
  state.summary = summary;
  state.odFeatures = od.features;
  state.projectedBounds = h3.features.reduce((bounds, feature) => geometryBounds(feature.geometry, bounds), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });

  renderComunas(comunas.features);
  renderH3(h3.features);
  renderOD(od.features);
  renderMetro(metroSegments.features);
  renderStations(stations.features);
  fitProjectedBounds(state.projectedBounds, 0.04);
  buildKpis();
  buildClusterList();
  setupControls();
  setupMapNavigation();
  setLayerVisibility();
  renderLegend();
  updateDefaultDetail();
}

init().catch((error) => {
  document.body.innerHTML = `<div style="padding:24px;color:white;background:#071013;font-family:system-ui">${error.message}</div>`;
  console.error(error);
});
