const DATA = {
  h3: "data/h3_cells.geojson",
  comunas: "data/comunas.geojson",
  stations: "data/metro_stations.geojson",
  metro: "data/metro_segments.geojson",
  od: "data/od_corridors.geojson",
  summary: "data/summary.json",
};

const PRIORITY_COLORS = {
  "Baja demanda local": "#17121f",
  "Demanda con acceso Metro": "#ff4fb8",
  "Brecha fuera de 1000 m": "#ffd166",
  "Candidato piloto Metro": "#9d4edd",
  "Brecha alimentador nocturno": "#ff3b30",
  "Estación crítica": "#f72585",
};

const LISA_COLORS = {
  HH: "#ff3b30",
  LL: "#3a2f4f",
  HL: "#9d4edd",
  LH: "#ffd166",
  "No significativo": "#211a2c",
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
  "#ff3b30",
  "#ffb703",
  "#ff4fb8",
  "#f72585",
  "#9d4edd",
  "#9b5de5",
  "#f15bb5",
  "#ffd166",
  "#c77dff",
  "#ff8fab",
];

const DECISION_COLORS = {
  pilot: "#ff4fb8",
  feeder: "#ff3b30",
  structure: "#ffd166",
  context: "#14101c",
};

const DECISION_LABELS = {
  pilot: "Piloto Metro nocturno",
  feeder: "Alimentador nocturno",
  structure: "Estructura de demanda",
};

const DECISION_MODES = new Set(["decision", "pilot", "feeder", "structure"]);

const state = {
  mode: "decision",
  scenario: "total",
  opacity: 0.72,
  odLimit: 10,
  activeODRank: null,
  selectedIds: new Set(),
  featureById: new Map(),
  elementById: new Map(),
  allFeatures: [],
  odFeatures: [],
  summary: null,
  projectedBounds: null,
  viewBox: null,
  drag: null,
  suppressClick: false,
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
  if (!decimals) return fmt0.format(n);
  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
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

function textKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isNearMetro(p) {
  const dist = Number(p.dist_metro_m);
  return Number(p.tiene_metro_1000m) === 1 || Number(p.n_estaciones_riel) > 0 || (Number.isFinite(dist) && dist <= 1000);
}

function isHighDemand(p) {
  const metric = metricForScenario();
  const value = Number(p[metric]);
  const q = state.summary?.metricas?.[metric];
  const label = textKey(p.nivel_demanda_h3);
  return label.includes("alta demanda") || label.includes("muy alta") || (q && Number.isFinite(value) && value >= q.p90);
}

function isVeryHighDemand(p) {
  const metric = metricForScenario();
  const value = Number(p[metric]);
  const q = state.summary?.metricas?.[metric];
  return textKey(p.nivel_demanda_h3).includes("muy alta") || (q && Number.isFinite(value) && value >= q.p95);
}

function decisionProfile(feature) {
  const p = feature.properties;
  const category = textKey(p.categoria_prioridad);
  const lisa = String(p.lisa_cluster || "");
  const nearMetro = isNearMetro(p);
  const highDemand = isHighDemand(p);
  const veryHighDemand = isVeryHighDemand(p);
  const hasStation = Number(p.n_estaciones_riel) > 0;
  const pilotScore = Number(p.score_piloto_metro);
  const feederScore = Number(p.score_brecha_cobertura);
  const lisaHot = lisa === "HH";
  const lisaBridge = lisa === "LH" || lisa === "HL";
  const pilot =
    nearMetro &&
    highDemand &&
    (hasStation || lisaHot || category.includes("candidato") || category.includes("critica") || pilotScore >= 0.82);
  const feeder =
    !nearMetro &&
    highDemand &&
    (category.includes("brecha") || lisaHot || lisaBridge || feederScore >= 0.8);
  const structure = lisaHot || veryHighDemand || (highDemand && (pilotScore >= 0.86 || feederScore >= 0.84));
  if (!pilot && !feeder && !structure) return null;
  const kind = pilot ? "pilot" : feeder ? "feeder" : "structure";
  return {
    kind,
    pilot,
    feeder,
    structure,
    label: DECISION_LABELS[kind],
    color: DECISION_COLORS[kind],
  };
}

function featureMatchesMode(feature, mode = state.mode) {
  const profile = decisionProfile(feature);
  if (mode === "decision") return Boolean(profile);
  if (mode === "pilot") return profile?.pilot === true;
  if (mode === "feeder") return profile?.feeder === true;
  if (mode === "structure") return profile?.structure === true;
  if (mode === "lisa") return ["HH", "LH", "HL"].includes(String(feature.properties.lisa_cluster || ""));
  return Number(feature.properties.es_celda_prioritaria) === 1;
}

function featuresForMode(mode = state.mode) {
  return state.allFeatures.filter((feature) => featureMatchesMode(feature, mode));
}

function modeTitle(mode = state.mode) {
  if (mode === "pilot") return "Piloto Metro nocturno";
  if (mode === "feeder") return "Alimentador nocturno";
  if (mode === "structure") return "Estructura de demanda";
  if (mode === "lisa") return "Clusters LISA relevantes";
  return "Vista ejecutiva";
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
  if (!Number.isFinite(n)) return "#211a2c";
  if (n < -1.5) return "#5a287a";
  if (n < -0.5) return "#9d4edd";
  if (n <= 0.5) return "#211a2c";
  if (n <= 1.5) return "#ffd166";
  return "#ff3b30";
}

function accessColor(p) {
  const dist = Number(p.dist_metro_m);
  if (Number(p.n_estaciones_riel) > 0) return "#f72585";
  if (!Number.isFinite(dist)) return "#2b2234";
  if (dist <= 800) return "#9d4edd";
  if (dist <= 1000) return "#c77dff";
  if (dist <= 2000) return "#ffd166";
  return "#ff3b30";
}

function fillColor(feature) {
  const p = feature.properties;
  const metric = metricForScenario();
  if (DECISION_MODES.has(state.mode)) {
    const profile = decisionProfile(feature);
    if (!profile) return DECISION_COLORS.context;
    if (state.mode === "pilot") return profile.pilot ? DECISION_COLORS.pilot : DECISION_COLORS.context;
    if (state.mode === "feeder") return profile.feeder ? DECISION_COLORS.feeder : DECISION_COLORS.context;
    if (state.mode === "structure") return profile.structure ? DECISION_COLORS.structure : DECISION_COLORS.context;
    return profile.color;
  }
  if (state.mode === "priority") return PRIORITY_COLORS[p.categoria_prioridad] || "#465057";
  if (state.mode === "demand") {
    return colorRamp(p[metric], metric, ["#15111d", "#33223f", "#6f2dbd", "#f72585", "#ffd166", "#ff3b30"]);
  }
  if (state.mode === "rate") {
    return colorRamp(p.origen_por_1000_personas, "origen_por_1000_personas", [
      "#15111d",
      "#3a2f4f",
      "#7b2cbf",
      "#9d4edd",
      "#ff4fb8",
      "#f72585",
    ]);
  }
  if (state.mode === "access") return accessColor(p);
  if (state.mode === "lisa") return LISA_COLORS[p.lisa_cluster] || "#dfe5e8";
  if (state.mode === "beneficiaries") {
    return colorRamp(p.beneficiarios_tp, "beneficiarios_tp", [
      "#15111d",
      "#2b1b35",
      "#5a287a",
      "#9d4edd",
      "#ff4fb8",
      "#ffd166",
    ]);
  }
  if (state.mode === "ols") return residualColor(p.residuos_ols_h3);
  return "#6baed6";
}

function styleH3Element(el, feature) {
  const p = feature.properties;
  const isSelected = state.selectedIds.has(p.h3_cell_id);
  const priorityOnly = document.getElementById("togglePriorityOnly")?.checked;
  const decisionMode = DECISION_MODES.has(state.mode) || state.mode === "lisa";
  const isVisibleDecision = featureMatchesMode(feature);
  const isPriority = Number(p.es_celda_prioritaria) === 1;
  const muted = priorityOnly && !(decisionMode ? isVisibleDecision : isPriority);
  el.setAttribute("fill", fillColor(feature));
  if (decisionMode) {
    el.setAttribute("fill-opacity", muted ? 0.02 : isVisibleDecision ? state.opacity : 0.055);
    el.setAttribute("stroke", isSelected ? "#f9f871" : isVisibleDecision ? "rgba(255,255,255,0.58)" : "rgba(255,79,184,0.12)");
    el.setAttribute("stroke-width", isSelected ? "2.5" : isVisibleDecision ? "0.72" : "0.22");
    el.setAttribute("opacity", muted ? "0.08" : "1");
  } else {
    el.setAttribute("fill-opacity", muted ? 0.035 : state.opacity);
    el.setAttribute("stroke", isSelected ? "#ffd166" : isPriority ? "rgba(255,143,171,0.72)" : "rgba(255,79,184,0.2)");
    el.setAttribute("stroke-width", isSelected ? "2.4" : isPriority ? "0.7" : "0.35");
    el.setAttribute("opacity", muted ? "0.16" : "1");
  }
  el.dataset.recommendation = decisionProfile(feature)?.kind || "context";
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

function textColorForBackground(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return "#120712";
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? "#120712" : "#fff7fb";
}

function recommendationReason(feature) {
  const p = feature.properties;
  const profile = decisionProfile(feature);
  if (!profile) return "Contexto urbano: no aparece como prioridad operativa bajo los criterios actuales.";
  if (profile.kind === "pilot") {
    return "Candidato a piloto Metro: alta demanda nocturna cerca de estación o dentro de cluster LISA de alta actividad.";
  }
  if (profile.kind === "feeder") {
    return "Candidato a alimentador nocturno: demanda relevante fuera del radio caminable de 1000 m de Metro.";
  }
  return "Núcleo estructural: cluster LISA o demanda muy alta que ayuda a ordenar la red nocturna.";
}

function tooltipHtml(p) {
  const feature = state.featureById.get(p.h3_cell_id) || { properties: p };
  const profile = decisionProfile(feature);
  const metric = metricForScenario();
  const olsRow = state.mode === "ols"
    ? `<span>Residuo OLS contextual</span><b>${number(p.residuos_ols_h3, 2)}</b>`
    : "";
  const tagColor = profile?.color || categoryTagColor(p.categoria_prioridad);
  return `
    <div class="tooltip-card">
      <span class="tag" style="background:${tagColor};color:${textColorForBackground(tagColor)}">${profile?.label || p.categoria_prioridad_label || p.categoria_prioridad || "Sin categoría"}</span>
      <h3>${p.comuna || "Comuna no asignada"} · H3 ${p.h3_short}</h3>
      <div class="tooltip-table">
        <span>Recomendación</span><b>${profile?.label || "Contexto"}</b>
        <span>${metricLabel()}</span><b>${number(p[metric], 1)}</b>
        <span>Población censal</span><b>${number(p.poblacion_total)}</b>
        <span>Distancia Metro</span><b>${number(p.dist_metro_m)} m</b>
        <span>LISA</span><b>${p.lisa_cluster || "Sin dato"}</b>
        <span>Score piloto</span><b>${number(p.score_piloto_metro, 2)}</b>
        <span>Score brecha</span><b>${number(p.score_brecha_cobertura, 2)}</b>
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

function decisionSummaryText(mode, features) {
  const pilotCount = featuresForMode("pilot").length;
  const feederCount = featuresForMode("feeder").length;
  const structureCount = featuresForMode("structure").length;
  if (mode === "pilot") {
    return `
      Prioriza celdas de alta demanda cerca de Metro, con estaciones críticas, candidatos de operación o clusters LISA HH.
      Útil para escoger dónde probar extensión horaria con menor inversión inicial.
    `;
  }
  if (mode === "feeder") {
    return `
      Prioriza celdas con demanda relevante fuera del radio caminable de 1000 m.
      Estas zonas sugieren servicios alimentadores nocturnos hacia estaciones o ejes troncales.
    `;
  }
  if (mode === "structure") {
    return `
      Muestra núcleos LISA y demanda muy alta que estructuran los viajes nocturnos.
      Sirve para entender dónde se concentra la presión de red antes de decidir la tecnología.
    `;
  }
  if (mode === "lisa") {
    return `
      Enfoca clusters LISA HH, LH y HL para separar concentración territorial, bordes de alta demanda y zonas atípicas.
      Las celdas no significativas quedan como fondo.
    `;
  }
  return `
    <b>${features.length}</b> zonas sugeridas. Hay <b>${pilotCount}</b> con señal de piloto Metro,
    <b>${feederCount}</b> con señal de alimentador y <b>${structureCount}</b> con señal estructural
    LISA/demanda. Las señales pueden superponerse; el color muestra la acción principal.
  `;
}

function updateDefaultDetail() {
  const features = featuresForMode();
  if (DECISION_MODES.has(state.mode) || state.mode === "lisa") {
    updateDetailForAggregate(modeTitle(), aggregate(features), decisionSummaryText(state.mode, features));
    return;
  }
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
  const profile = decisionProfile(feature);
  updateDetailForAggregate(`${p.comuna || "Santiago"} · H3 ${p.h3_short}`, stats, `
    <b>${profile?.label || p.categoria_prioridad_label || p.categoria_prioridad || "Contexto"}.</b>
    ${recommendationReason(feature)}
    LISA: <b>${p.lisa_cluster || "sin dato"}</b>; distancia a Metro: <b>${number(p.dist_metro_m)} m</b>;
    score piloto: <b>${number(p.score_piloto_metro, 2)}</b>; score brecha: <b>${number(p.score_brecha_cobertura, 2)}</b>.
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
  const pilotCount = features.filter((feature) => decisionProfile(feature)?.pilot).length;
  const feederCount = features.filter((feature) => decisionProfile(feature)?.feeder).length;
  const structureCount = features.filter((feature) => decisionProfile(feature)?.structure).length;
  updateDetailForAggregate(`Selección · ${stats.celdas} celdas`, stats, `
    En la selección, <b>${pct(nearShare, 1)}</b> de las celdas está a 1000 m o menos de una estación.
    Lectura operativa: <b>${pilotCount}</b> piloto Metro, <b>${feederCount}</b> alimentador nocturno y
    <b>${structureCount}</b> estructura de demanda.
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
      path.setAttribute("stroke", "#ffd166");
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
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = svg.getBoundingClientRect();
    state.drag = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      rect: { width: rect.width, height: rect.height },
      view: { ...state.viewBox },
      moved: false,
    };
    hideTooltip();
    mapEl.classList.add("dragging");
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort across input devices.
    }
  });
  svg.addEventListener("pointermove", (event) => {
    if (!state.drag) return;
    event.preventDefault();
    const clientDx = event.clientX - state.drag.startClientX;
    const clientDy = event.clientY - state.drag.startClientY;
    const svgDx = (clientDx / Math.max(state.drag.rect.width, 1)) * state.drag.view.w;
    const svgDy = (clientDy / Math.max(state.drag.rect.height, 1)) * state.drag.view.h;
    state.drag.moved = state.drag.moved || Math.hypot(clientDx, clientDy) > 3;
    state.viewBox.x = state.drag.view.x - svgDx;
    state.viewBox.y = state.drag.view.y - svgDy;
    state.viewBox.w = state.drag.view.w;
    state.viewBox.h = state.drag.view.h;
    applyViewBox();
  });
  const finishDrag = (event) => {
    if (!state.drag) return;
    const moved = state.drag?.moved === true;
    state.drag = null;
    state.suppressClick = moved;
    mapEl.classList.remove("dragging");
    try {
      if (event?.pointerId !== undefined) svg.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    if (moved) window.setTimeout(() => { state.suppressClick = false; }, 0);
  };
  svg.addEventListener("pointerup", finishDrag);
  svg.addEventListener("pointercancel", finishDrag);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
  window.addEventListener("blur", finishDrag);
  svg.addEventListener("lostpointercapture", () => {
    state.drag = null;
    mapEl.classList.remove("dragging");
  });
  svg.addEventListener("click", (event) => {
    if (!state.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    state.suppressClick = false;
  }, true);
  svg.addEventListener("click", () => {
    if (!state.selectedIds.size) updateDefaultDetail();
  });
}

function renderLegend() {
  const legend = document.getElementById("legend");
  let title = "";
  let rows = [];
  if (DECISION_MODES.has(state.mode)) {
    title = state.mode === "decision" ? "Recomendación operativa" : modeTitle();
    rows = state.mode === "decision"
      ? [
          ["Piloto Metro", DECISION_COLORS.pilot],
          ["Alimentador nocturno", DECISION_COLORS.feeder],
          ["Núcleo de demanda", DECISION_COLORS.structure],
          ["Contexto", DECISION_COLORS.context],
        ]
      : [
          ["Zonas foco", DECISION_COLORS[state.mode]],
          ["Contexto", DECISION_COLORS.context],
        ];
  } else if (state.mode === "priority") {
    title = "Prioridad territorial";
    rows = Object.entries(PRIORITY_COLORS);
  } else if (state.mode === "demand") {
    title = `Demanda: ${metricLabel()}`;
    rows = [["Baja", "#15111d"], ["Media", "#6f2dbd"], ["Alta", "#ffd166"], ["Muy alta", "#ff3b30"]];
  } else if (state.mode === "rate") {
    title = "Orígenes por 1000 personas";
    rows = [["Baja", "#15111d"], ["Media", "#7b2cbf"], ["Alta", "#ff4fb8"], ["Muy alta", "#f72585"]];
  } else if (state.mode === "access") {
    title = "Accesibilidad a Metro";
    rows = [["Celda con estación", "#f72585"], ["<= 800 m", "#9d4edd"], ["800-1000 m", "#c77dff"], ["1000-2000 m", "#ffd166"], ["> 2000 m", "#ff3b30"]];
  } else if (state.mode === "lisa") {
    title = "LISA";
    rows = Object.entries(LISA_COLORS);
  } else if (state.mode === "beneficiaries") {
    title = "Usuarios censales de transporte público";
    rows = [["Bajo", "#15111d"], ["Medio", "#5a287a"], ["Alto", "#ff4fb8"], ["Muy alto", "#ffd166"]];
  } else {
    title = "Residuo OLS contextual";
    rows = [["Sobreestimado", "#5a287a"], ["Cercano a cero", "#211a2c"], ["Subestimado", "#ff3b30"]];
  }
  legend.innerHTML = `<h3>${title}</h3>${rows
    .map(([label, color]) => `<div class="legend-row"><span class="swatch" style="background:${color}"></span><span>${label}</span></div>`)
    .join("")}`;
}

function buildKpis() {
  const visibleFeatures = DECISION_MODES.has(state.mode) || state.mode === "lisa"
    ? featuresForMode()
    : state.allFeatures.filter((feature) => Number(feature.properties.es_celda_prioritaria) === 1);
  const p = visibleFeatures.length ? aggregate(visibleFeatures) : state.summary.prioritarias;
  const metric = metricForScenario();
  document.getElementById("kpiPriorityCells").textContent = number(p.celdas);
  document.getElementById("kpiPriorityPeople").textContent = number(p[metric] ?? p.viajes_total_dia_promedio, 1);
  document.getElementById("kpiPriorityTp").textContent = number(p.demanda_potencial_metro, 1);
  document.getElementById("kpiPriorityDemand").textContent = number(p.demanda_potencial_alimentador, 1);
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
  if (!features.length) return state.projectedBounds;
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
  const features = featuresForMode(state.mode === "lisa" ? "lisa" : "decision");
  fitProjectedBounds(boundsForFeatures(features), 0.08);
}

function setupControls() {
  document.querySelectorAll("#layerMode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#layerMode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
      refreshH3Styles();
      buildKpis();
      if (state.selectedIds.size) updateDetailForSelection();
      else updateDefaultDetail();
    });
  });

  document.querySelectorAll("#scenarioMode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#scenarioMode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.scenario = btn.dataset.scenario;
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
  state.allFeatures = h3.features;
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
