import {
  DATA,
  DECISION_COLORS,
  DECISION_LABELS,
  DECISION_MODES,
  DETERMINANT_VARIABLES,
  LISA_COLORS,
  METRO_COLORS,
  OD_COLORS,
  PILOT_CELL_MAX_STATION_M,
  PILOT_STATION_MAX_CORRIDOR_M,
  PRIORITY_COLORS,
  STRUCTURE_COLORS,
} from "./config.js";

const state = {
  mode: "decision",
  scenario: "total",
  opacity: 0.68,
  odLimit: 10,
  activeODRank: null,
  featureById: new Map(),
  elementById: new Map(),
  glowElementById: new Map(),
  allFeatures: [],
  odFeatures: [],
  stationFeatures: [],
  pilotStations: [],
  summary: null,
  correlations: [],
  correlationByKey: new Map(),
  projectedBounds: null,
  viewBox: null,
  drag: null,
  suppressClick: false,
};

const svg = document.getElementById("mapSvg");
const viewport = document.getElementById("mapViewport");
const groups = {
  comunas: document.getElementById("comunaGroup"),
  h3Glow: document.getElementById("h3GlowGroup"),
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

function quantiles(metric) {
  return state.summary?.metricas?.[metric] || {};
}

function metricBand(value, metric) {
  const n = Number(value);
  const q = quantiles(metric);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= q.p99) return 5;
  if (n >= q.p95) return 4;
  if (n >= q.p90) return 3;
  if (n >= q.p75) return 2;
  if (n >= q.p50) return 1;
  return 0;
}

function determinantRawValue(variable, p) {
  const value = Number(p[variable.key]);
  return Number.isFinite(value) ? value : null;
}

function determinantModelValue(variable, p) {
  const raw = determinantRawValue(variable, p);
  if (raw === null) return null;
  if (variable.transform === "log1p") return Math.log1p(Math.max(0, raw));
  if (variable.transform === "inverseLog1p") return -Math.log1p(Math.max(0, raw));
  return raw;
}

function formatCorrelation(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatDeterminantValue(variable, p) {
  const raw = determinantRawValue(variable, p);
  if (raw === null) return "--";
  if (variable.format === "pct") return `${number(raw, 1)}%`;
  if (variable.format === "density") return `${number(raw)} hab/km²`;
  if (variable.format === "distance") return `${number(raw)} m`;
  return number(raw);
}

function pearsonCorrelation(variable, metric) {
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  state.allFeatures.forEach((feature) => {
    const p = feature.properties;
    const x = determinantModelValue(variable, p);
    const y = Number(p[metric]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    n += 1;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  });
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  return denominator ? numerator / denominator : NaN;
}

function computeCorrelationRows() {
  const metric = metricForScenario();
  return DETERMINANT_VARIABLES.map((variable) => ({
    ...variable,
    correlation: pearsonCorrelation(variable, metric),
  })).sort((a, b) => Math.abs(b.correlation || 0) - Math.abs(a.correlation || 0));
}

function renderCorrelationChart() {
  const chart = document.getElementById("correlationChart");
  const meta = document.getElementById("correlationMeta");
  if (!chart) return;
  const rows = computeCorrelationRows();
  state.correlations = rows;
  state.correlationByKey = new Map(rows.map((row) => [row.key, row]));
  if (meta) meta.textContent = `Correlación Pearson (r) con ${metricLabel()}.`;
  chart.innerHTML = rows
    .map((row) => {
      const value = Number(row.correlation);
      const magnitude = Number.isFinite(value) ? Math.min(1, Math.abs(value)) : 0;
      const start = value < 0 ? 50 - magnitude * 50 : 50;
      return `
        <div class="correlation-row" title="${row.rationale}">
          <span>${row.label}</span>
          <i class="correlation-track" aria-hidden="true">
            <i class="correlation-zero"></i>
            <i class="correlation-bar" style="--corr-start:${start}%;--corr-width:${magnitude * 50}%;--corr-color:${row.color};"></i>
          </i>
          <b>${formatCorrelation(value)}</b>
        </div>`;
    })
    .join("");
}

function demandBand(p) {
  return metricBand(p[metricForScenario()], metricForScenario());
}

function glowForColor(hex, alpha = 0.76) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return "rgba(255, 79, 184, 0.72)";
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightProfile(intensity = 0) {
  const level = Math.max(0, Math.min(5, Number(intensity) || 0));
  return {
    level,
    minBrightness: (0.98 + level * 0.035).toFixed(2),
    maxBrightness: (1.03 + level * 0.057).toFixed(2),
    tightGlow: `${(1.2 + level * 0.42).toFixed(1)}px`,
    wideGlow: `${(4.4 + level * 1.35).toFixed(1)}px`,
    farGlow: `${(8 + level * 3.1).toFixed(1)}px`,
    pulse: `${(5.2 - level * 0.38).toFixed(2)}s`,
  };
}

function isNearMetro(p) {
  const dist = Number(p.dist_metro_m);
  return Number(p.tiene_metro_1000m) === 1 || Number(p.n_estaciones_riel) > 0 || (Number.isFinite(dist) && dist <= 1000);
}

function isPilotStation(p) {
  return (
    p.es_estacion_colindante_top10 === true &&
    Number(p.corredor_mas_cercano_rank) <= 10 &&
    Number(p.distancia_min_corredor_m) <= PILOT_STATION_MAX_CORRIDOR_M
  );
}

function distanceMeters(lon1, lat1, lon2, lat2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function linkPilotStations(h3Features, stationFeatures) {
  state.stationFeatures = stationFeatures;
  state.pilotStations = stationFeatures
    .filter((feature) => isPilotStation(feature.properties))
    .sort((a, b) => {
      const rankA = Number(a.properties.corredor_mas_cercano_rank) || 99;
      const rankB = Number(b.properties.corredor_mas_cercano_rank) || 99;
      const distA = Number(a.properties.distancia_min_corredor_m) || 9999;
      const distB = Number(b.properties.distancia_min_corredor_m) || 9999;
      return rankA - rankB || distA - distB;
    });

  h3Features.forEach((feature) => {
    const p = feature.properties;
    let best = null;
    state.pilotStations.forEach((station) => {
      const [lon, lat] = station.geometry.coordinates;
      const distance = distanceMeters(Number(p.lon), Number(p.lat), lon, lat);
      if (!best || distance < best.distance) best = { station, distance };
    });

    delete p.pilot_station_id;
    delete p.pilot_station_name;
    delete p.pilot_station_lines;
    delete p.pilot_station_distance_m;
    delete p.pilot_corridor_rank;
    delete p.pilot_corridor_name;
    delete p.pilot_corridor_trips;

    if (!best || best.distance > PILOT_CELL_MAX_STATION_M) return;
    const stationProps = best.station.properties;
    p.pilot_station_id = stationProps.station_id;
    p.pilot_station_name = stationProps.nombre_estacion;
    p.pilot_station_lines = stationProps.lineas_metro;
    p.pilot_station_distance_m = best.distance;
    p.pilot_corridor_rank = stationProps.corredor_mas_cercano_rank;
    p.pilot_corridor_name = stationProps.corredor_mas_cercano_comunal;
    p.pilot_corridor_trips = stationProps.viajes_corredor_mas_cercano;
  });
}

function decisionProfile(feature) {
  const p = feature.properties;
  const category = textKey(p.categoria_prioridad);
  const lisa = String(p.lisa_cluster || "");
  const nearMetro = isNearMetro(p);
  const metric = metricForScenario();
  const value = Number(p[metric]);
  const band = demandBand(p);
  const q = quantiles(metric);
  const residualQ = quantiles("residuos_ols_h3");
  const pilotScore = Number(p.score_piloto_metro);
  const feederScore = Number(p.score_brecha_cobertura);
  const lisaHot = lisa === "HH";
  const lisaBridge = lisa === "LH" || lisa === "HL";
  const pilotStation = Boolean(p.pilot_station_id);
  const strongDemand = band >= 4 || lisaHot;
  const feederDemand = band >= 3 || lisaHot || lisaBridge;
  const extremeDemand = band >= 5 || (Number.isFinite(value) && Number.isFinite(q.p99) && value >= q.p99);
  const highResidual =
    Number.isFinite(Number(p.residuos_ols_h3)) &&
    Number.isFinite(residualQ.p90) &&
    Number(p.residuos_ols_h3) >= residualQ.p90;
  const pilot =
    pilotStation &&
    (strongDemand || (band >= 3 && pilotScore >= 0.88) || category.includes("critica"));
  const feeder =
    !nearMetro &&
    feederDemand &&
    category.includes("brecha") &&
    (band >= 4 || lisaHot || lisaBridge || feederScore >= 0.805);
  const structure =
    (lisaHot && band >= 2) ||
    (lisaBridge && band >= 3) ||
    (extremeDemand && highResidual);
  if (!pilot && !feeder && !structure) return null;
  const kind = pilot ? "pilot" : feeder ? "feeder" : "structure";
  const intensity = Math.max(
    band,
    pilot ? metricBand(pilotScore, "score_piloto_metro") : 0,
    feeder ? metricBand(feederScore, "score_brecha_cobertura") : 0,
  );
  const color = DECISION_COLORS[kind];
  return {
    kind,
    pilot,
    feeder,
    structure,
    intensity,
    label: DECISION_LABELS[kind],
    color,
    glow: glowForColor(color),
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

function structureColor(feature) {
  return STRUCTURE_COLORS[getStructureLevel(feature)];
}

function getStructureLevel(feature) {
  const p = feature.properties;
  const band = demandBand(p);
  const residualQ = quantiles("residuos_ols_h3");
  const residual = Number(p.residuos_ols_h3);
  const residualHot = Number.isFinite(residual) && Number.isFinite(residualQ.p90) && residual >= residualQ.p90;
  if (band >= 5 && residualHot) return "residual";
  if (band >= 5) return "extreme";
  if (band >= 4) return "veryHigh";
  return "high";
}

function fillColor(feature) {
  const p = feature.properties;
  const metric = metricForScenario();
  if (DECISION_MODES.has(state.mode)) {
    const profile = decisionProfile(feature);
    if (!profile) return DECISION_COLORS.context;
    if (state.mode === "pilot") return profile.pilot ? DECISION_COLORS.pilot : DECISION_COLORS.context;
    if (state.mode === "feeder") return profile.feeder ? DECISION_COLORS.feeder : DECISION_COLORS.context;
    if (state.mode === "structure") return profile.structure ? structureColor(feature) : DECISION_COLORS.context;
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
  if (state.mode === "lisa") return LISA_COLORS[p.lisa_cluster] || DECISION_COLORS.context;
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
  const profile = decisionProfile(feature);
  const glowEl = state.glowElementById.get(p.h3_cell_id);
  const priorityOnly = document.getElementById("togglePriorityOnly")?.checked;
  const decisionMode = DECISION_MODES.has(state.mode) || state.mode === "lisa";
  const isVisibleDecision = featureMatchesMode(feature);
  const isPriority = Number(p.es_celda_prioritaria) === 1;
  const muted = priorityOnly && !(decisionMode ? isVisibleDecision : isPriority);
  const color = fillColor(feature);
  const visibleIntensity =
    state.mode === "structure" && isVisibleDecision
      ? Math.max(3, demandBand(p))
      : profile?.intensity || demandBand(p);
  const light = lightProfile(isVisibleDecision ? visibleIntensity : 0);
  el.setAttribute("fill", color);
  const applyLightVars = (target, alpha = 0.82) => {
    target.style.setProperty("--cell-glow", glowForColor(color, alpha));
    target.style.setProperty("--cell-brightness-min", light.minBrightness);
    target.style.setProperty("--cell-brightness-max", light.maxBrightness);
    target.style.setProperty("--cell-glow-tight", light.tightGlow);
    target.style.setProperty("--cell-glow-wide", light.wideGlow);
    target.style.setProperty("--cell-glow-far", light.farGlow);
    target.style.setProperty("--cell-pulse", light.pulse);
    target.style.setProperty("--halo-opacity-min", (0.14 + light.level * 0.035).toFixed(2));
    target.style.setProperty("--halo-opacity-max", (0.28 + light.level * 0.055).toFixed(2));
  };
  applyLightVars(el, isVisibleDecision ? 0.82 : 0.22);
  if (decisionMode) {
    el.setAttribute("fill-opacity", muted ? 0.02 : isVisibleDecision ? state.opacity : 0.055);
    el.setAttribute("stroke", isVisibleDecision ? glowForColor(color, 0.82) : "rgba(255,79,184,0.12)");
    el.setAttribute("stroke-width", isVisibleDecision ? "0.82" : "0.22");
    el.setAttribute("opacity", muted ? "0.08" : "1");
  } else {
    el.setAttribute("fill-opacity", muted ? 0.035 : state.opacity);
    el.setAttribute("stroke", isPriority ? "rgba(255,143,171,0.72)" : "rgba(255,79,184,0.2)");
    el.setAttribute("stroke-width", isPriority ? "0.7" : "0.35");
    el.setAttribute("opacity", muted ? "0.16" : "1");
  }
  const activeKind =
    decisionMode && isVisibleDecision
      ? state.mode === "decision"
        ? profile?.kind
        : state.mode === "lisa"
          ? "lisa"
          : state.mode
      : "context";
  const currentStructureLevel = state.mode === "structure" && activeKind === "structure" ? getStructureLevel(feature) : "";
  el.dataset.recommendation = activeKind || "context";
  el.dataset.structureLevel = currentStructureLevel;
  el.dataset.intensity = String(light.level);
  el.setAttribute("vector-effect", "non-scaling-stroke");

  if (glowEl) {
    const setGlowAnimation = (attributeName, values) => {
      const anim = glowEl.querySelector(`[data-anim="${attributeName}"]`);
      if (!anim) return;
      anim.setAttribute("values", values);
      anim.setAttribute("dur", light.pulse);
    };
    glowEl.setAttribute("fill", color);
    glowEl.setAttribute("stroke", glowForColor(color, 0.92));
    glowEl.dataset.recommendation = activeKind || "context";
    glowEl.dataset.structureLevel = currentStructureLevel;
    glowEl.dataset.intensity = String(light.level);
    glowEl.setAttribute("vector-effect", "non-scaling-stroke");
    applyLightVars(glowEl, 0.9);
    if (decisionMode && isVisibleDecision && !muted) {
      const opacityMin = (0.12 + light.level * 0.035).toFixed(2);
      const opacityMax = (0.34 + light.level * 0.065).toFixed(2);
      const fillMin = (0.08 + light.level * 0.02).toFixed(2);
      const fillMax = (0.2 + light.level * 0.04).toFixed(2);
      const strokeMin = (0.18 + light.level * 0.06).toFixed(2);
      const strokeMax = (0.42 + light.level * 0.08).toFixed(2);
      const widthMin = (3.4 + light.level * 1.25).toFixed(2);
      const widthMax = (6.8 + light.level * 1.95).toFixed(2);
      glowEl.setAttribute("fill-opacity", fillMin);
      glowEl.setAttribute("stroke-opacity", strokeMin);
      glowEl.setAttribute("stroke-width", widthMin);
      glowEl.setAttribute("opacity", "1");
      setGlowAnimation("opacity", `${opacityMin};${opacityMax};${opacityMin}`);
      setGlowAnimation("fill-opacity", `${fillMin};${fillMax};${fillMin}`);
      setGlowAnimation("stroke-opacity", `${strokeMin};${strokeMax};${strokeMin}`);
      setGlowAnimation("stroke-width", `${widthMin};${widthMax};${widthMin}`);
    } else {
      glowEl.setAttribute("fill-opacity", "0");
      glowEl.setAttribute("stroke-opacity", "0");
      glowEl.setAttribute("stroke-width", "0");
      glowEl.setAttribute("opacity", "0");
      setGlowAnimation("opacity", "0;0;0");
      setGlowAnimation("fill-opacity", "0;0;0");
      setGlowAnimation("stroke-opacity", "0;0;0");
      setGlowAnimation("stroke-width", "0;0;0");
    }
  }
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
    return `Estación piloto sugerida: ${p.pilot_station_name || "estación cercana"} concentra señal de corredor OD top ${p.pilot_corridor_rank || "--"} y demanda nocturna alta.`;
  }
  if (profile.kind === "feeder") {
    return "Candidato a alimentador nocturno: demanda relevante fuera del radio caminable de 1000 m de Metro, con brecha de cobertura y score alto.";
  }
  return "Núcleo estructural: cluster LISA significativo o demanda extrema con residuo alto; ayuda a ordenar la red nocturna.";
}

function determinantTooltipRows(p) {
  return DETERMINANT_VARIABLES.map((variable) => {
    const correlation = state.correlationByKey.get(variable.key)?.correlation;
    return `
      <span>${variable.shortLabel}</span>
      <b>${formatDeterminantValue(variable, p)} · r ${formatCorrelation(correlation)}</b>`;
  }).join("");
}

function determinantFeatureSummary(p) {
  return DETERMINANT_VARIABLES.map((variable) => {
    const correlation = state.correlationByKey.get(variable.key)?.correlation;
    return `<span><b>${variable.shortLabel}:</b> ${formatDeterminantValue(variable, p)} · r ${formatCorrelation(correlation)}</span>`;
  }).join("");
}

function tooltipHtml(p) {
  const feature = state.featureById.get(p.h3_cell_id) || { properties: p };
  const profile = decisionProfile(feature);
  const metric = metricForScenario();
  const olsRow = state.mode === "ols"
    ? `<span>Residuo OLS contextual</span><b>${number(p.residuos_ols_h3, 2)}</b>`
    : "";
  const pilotRows = p.pilot_station_name
    ? `
        <span>Estación piloto</span><b>${p.pilot_station_name} (${p.pilot_station_lines || "--"})</b>
        <span>Corredor OD</span><b>#${p.pilot_corridor_rank || "--"} · ${number(p.pilot_corridor_trips, 1)} viajes/día</b>
        <span>Distancia a estación</span><b>${number(p.pilot_station_distance_m)} m</b>
      `
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
        ${pilotRows}
        ${olsRow}
      </div>
      <div class="tooltip-divider">Variables seleccionadas</div>
      <div class="tooltip-table determinant-tooltip">
        ${determinantTooltipRows(p)}
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
      Prioriza celdas de alta demanda alrededor de estaciones a 800 m o menos de corredores OD top 10.
      Útil para escoger qué estaciones deberían abrir primero en un piloto nocturno.
    `;
  }
  if (mode === "feeder") {
    return `
      Prioriza celdas con demanda alta fuera del radio caminable de 1000 m y brecha de cobertura consistente.
      Estas zonas sugieren servicios alimentadores nocturnos hacia estaciones o ejes troncales.
    `;
  }
  if (mode === "structure") {
    return `
      Muestra núcleos LISA HH/LH/HL y casos extremos p99 con residuo alto.
      El matiz del color expresa intensidad de demanda para ordenar las celdas más solicitadas.
    `;
  }
  if (mode === "lisa") {
    return `
      Enfoca clusters LISA HH, LH y HL para separar concentración territorial, bordes de alta demanda y zonas atípicas.
      LL y las celdas no significativas quedan como contexto: no se interpretan como foco operativo para esta decisión.
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
  const pilotText = p.pilot_station_name
    ? ` Estación asociada: <b>${p.pilot_station_name}</b> (${p.pilot_station_lines || "--"}), corredor OD #<b>${p.pilot_corridor_rank || "--"}</b> a <b>${number(p.pilot_station_distance_m)} m</b>.`
    : "";
  updateDetailForAggregate(`${p.comuna || "Santiago"} · H3 ${p.h3_short}`, stats, `
    <b>${profile?.label || p.categoria_prioridad_label || p.categoria_prioridad || "Contexto"}.</b>
    ${recommendationReason(feature)}
    ${pilotText}
    LISA: <b>${p.lisa_cluster || "sin dato"}</b>; distancia a Metro: <b>${number(p.dist_metro_m)} m</b>;
    score piloto: <b>${number(p.score_piloto_metro, 2)}</b>; score brecha: <b>${number(p.score_brecha_cobertura, 2)}</b>.
    <div class="feature-determinants"><strong>Variables locales seleccionadas</strong>${determinantFeatureSummary(p)}</div>
  `);
}

function renderH3(features) {
  groups.h3Glow.replaceChildren();
  groups.h3.replaceChildren();
  state.featureById.clear();
  state.elementById.clear();
  state.glowElementById.clear();
  features.forEach((feature) => {
    const p = feature.properties;
    const d = pathFromGeometry(feature.geometry);
    const glowPath = createSvg("path", {
      class: "h3-cell-glow",
      d,
      "data-id": p.h3_cell_id,
    });
    ["opacity", "fill-opacity", "stroke-opacity", "stroke-width"].forEach((attributeName) => {
      glowPath.appendChild(createSvg("animate", {
        "data-anim": attributeName,
        attributeName,
        dur: "3.2s",
        repeatCount: "indefinite",
        values: "0;0;0",
      }));
    });
    const path = createSvg("path", {
      class: "h3-cell",
      d,
      "data-id": p.h3_cell_id,
    });
    state.featureById.set(p.h3_cell_id, feature);
    state.elementById.set(p.h3_cell_id, path);
    state.glowElementById.set(p.h3_cell_id, glowPath);
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
      updateDefaultDetail();
    });
    groups.h3Glow.appendChild(glowPath);
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
    const selected = isPilotStation(p);
    const dot = createSvg("circle", {
      class: `station-dot${selected ? " pilot-station" : ""}`,
      cx: x,
      cy: y,
      r: selected ? 108 : 52,
      "vector-effect": "non-scaling-stroke",
    });
    dot.addEventListener("mouseenter", (event) => {
      const pilotRows = selected
        ? `
          <span>Piloto sugerido</span><b>Sí</b>
          <span>Corredor OD</span><b>#${p.corredor_mas_cercano_rank} · ${p.corredor_mas_cercano_comunal || "--"}</b>
          <span>Viajes corredor</span><b>${number(p.viajes_corredor_mas_cercano, 1)} diarios</b>
          <span>Distancia corredor</span><b>${number(p.distancia_min_corredor_m)} m</b>
        `
        : `<span>Piloto sugerido</span><b>No bajo criterio actual</b>`;
      showTooltip(`<div class="tooltip-card"><h3>${p.nombre_estacion}</h3><div class="tooltip-table"><span>Líneas</span><b>${p.lineas_metro || "--"}</b>${pilotRows}</div></div>`, event);
    });
    dot.addEventListener("mousemove", moveTooltip);
    dot.addEventListener("mouseleave", hideTooltip);
    dot.addEventListener("click", (event) => {
      if (!selected) return;
      event.stopPropagation();
      selectPilotStation(p.station_id);
    });
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
      style: `--corridor-glow:${glowForColor(odColor(rank), 0.72)}`,
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
    updateDefaultDetail();
  });
}

function renderLegend() {
  const legend = document.getElementById("legend");
  let title = "";
  let rows = [];
  if (DECISION_MODES.has(state.mode)) {
    title = state.mode === "decision" ? "Recomendación operativa" : modeTitle();
    if (state.mode === "decision") {
      rows = [
        ["Piloto Metro", DECISION_COLORS.pilot, "pilot", 4],
        ["Alimentador nocturno", DECISION_COLORS.feeder, "feeder", 4],
        ["Núcleo de demanda", DECISION_COLORS.structure, "structure", 4],
        ["Contexto / sin foco", DECISION_COLORS.context, "context", 0],
      ];
    } else if (state.mode === "structure") {
      rows = [
        ["Alta demanda LISA", STRUCTURE_COLORS.high, "structure", 3],
        ["Muy alta demanda", STRUCTURE_COLORS.veryHigh, "structure", 4],
        ["Demanda extrema", STRUCTURE_COLORS.extreme, "structure", 5],
        ["Extrema + residuo alto", STRUCTURE_COLORS.residual, "structure", 5],
        ["Contexto / sin foco", DECISION_COLORS.context, "context", 0],
      ];
    } else {
      rows = [
        [state.mode === "pilot" ? "Celdas junto a estaciones piloto" : "Celdas de brecha alimentador", DECISION_COLORS[state.mode], state.mode, 4],
        ["Contexto / sin foco", DECISION_COLORS.context, "context", 0],
      ];
    }
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
    rows = [
      ["HH · concentración alta", LISA_COLORS.HH, "lisa", 4],
      ["LH · borde de alta demanda", LISA_COLORS.LH, "lisa", 3],
      ["HL · atípico territorial", LISA_COLORS.HL, "lisa", 3],
      ["LL · baja-baja / contexto", LISA_COLORS.LL, "context", 0],
      ["No significativo / sin señal", LISA_COLORS["No significativo"], "context", 0],
    ];
  } else if (state.mode === "beneficiaries") {
    title = "Usuarios censales de transporte público";
    rows = [["Bajo", "#15111d"], ["Medio", "#5a287a"], ["Alto", "#ff4fb8"], ["Muy alto", "#ffd166"]];
  } else {
    title = "Residuo OLS contextual";
    rows = [["Sobreestimado", "#5a287a"], ["Cercano a cero", "#211a2c"], ["Subestimado", "#ff3b30"]];
  }
  legend.innerHTML = `<h3>${title}</h3>${rows
    .map(([label, color, key = "", intensity = 0]) => {
      const light = lightProfile(intensity);
      return `<div class="legend-row"><span class="swatch" data-key="${key}" data-intensity="${intensity}" style="background:${color};--legend-glow:${glowForColor(color, 0.82)};--legend-brightness:${light.maxBrightness};--legend-glow-tight:${light.tightGlow};--legend-glow-wide:${light.wideGlow}"></span><span>${label}</span></div>`;
    })
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
  const metric = metricForScenario();

  if (state.mode === "decision" || state.mode === "pilot") {
    const rows = state.pilotStations.slice(0, 7);
    target.innerHTML = rows
      .map((station) => {
        const p = station.properties;
        return `
          <button class="cluster-card" data-station="${p.station_id}">
            <strong>${p.nombre_estacion} · ${p.lineas_metro || "--"}</strong>
            <span>OD #${p.corredor_mas_cercano_rank} · ${number(p.viajes_corredor_mas_cercano, 1)} viajes/día · ${number(p.distancia_min_corredor_m)} m al corredor</span>
          </button>`;
      })
      .join("");
    target.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => selectPilotStation(btn.dataset.station));
    });
    return;
  }

  const rows = featuresForMode()
    .sort((a, b) => (Number(b.properties[metric]) || 0) - (Number(a.properties[metric]) || 0))
    .slice(0, 7);
  target.innerHTML = rows.length
    ? rows
        .map((feature) => {
          const p = feature.properties;
          return `
            <button class="cluster-card" data-h3="${p.h3_cell_id}">
              <strong>${p.comuna || "Santiago"} · H3 ${p.h3_short}</strong>
              <span>${number(p[metric], 1)} viajes/día · LISA ${p.lisa_cluster || "--"} · ${number(p.dist_metro_m)} m a Metro</span>
            </button>`;
        })
        .join("")
    : `<p class="empty-focus">No hay focos bajo el criterio activo.</p>`;
  target.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => selectFeature(btn.dataset.h3));
  });
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

function selectFeature(id) {
  const feature = state.featureById.get(id);
  if (!feature) return;
  fitProjectedBounds(boundsForFeatures([feature]), 0.38);
  updateDetailForFeature(feature);
}

function selectPilotStation(stationId) {
  const features = state.allFeatures.filter(
    (feature) => feature.properties.pilot_station_id === stationId && featureMatchesMode(feature, "pilot"),
  );
  if (!features.length) return;
  fitProjectedBounds(boundsForFeatures(features), 0.34);
  const stats = aggregate(features);
  const nearShare = stats.celdas ? (stats.cerca1000 / stats.celdas) * 100 : 0;
  updateDetailForAggregate(`Estación piloto · ${features[0].properties.pilot_station_name || "foco sugerido"}`, stats, `
    Zona de referencia alrededor de la estación sugerida. <b>${pct(nearShare, 1)}</b> de las celdas está a
    1000 m o menos de una estación, con demanda asociada al corredor OD top
    <b>${features[0].properties.pilot_corridor_rank || "--"}</b>.
  `);
}

function zoomPriority() {
  const features = featuresForMode(DECISION_MODES.has(state.mode) || state.mode === "lisa" ? state.mode : "decision");
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
      buildClusterList();
      updateDefaultDetail();
    });
  });

  document.querySelectorAll("#scenarioMode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#scenarioMode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.scenario = btn.dataset.scenario;
      refreshH3Styles();
      buildKpis();
      buildClusterList();
      renderCorrelationChart();
      updateDefaultDetail();
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
  linkPilotStations(h3.features, stations.features);
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
  renderCorrelationChart();
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
