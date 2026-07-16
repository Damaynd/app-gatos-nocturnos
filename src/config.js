export const DATA = {
  h3: "data/h3_cells.geojson",
  comunas: "data/comunas.geojson",
  stations: "data/metro_stations.geojson",
  metro: "data/metro_segments.geojson",
  od: "data/od_corridors.geojson",
  summary: "data/summary.json",
};

export const PRIORITY_COLORS = {
  "Baja demanda local": "#17121f",
  "Demanda con acceso Metro": "#ff4fb8",
  "Brecha fuera de 1000 m": "#ffd166",
  "Candidato piloto Metro": "#9d4edd",
  "Brecha alimentador nocturno": "#ff3b30",
  "Estación crítica": "#f72585",
};

export const LISA_COLORS = {
  HH: "#ff3b30",
  LL: "#14101c",
  HL: "#9d4edd",
  LH: "#ffd166",
  "No significativo": "#211a2c",
};

export const METRO_COLORS = {
  L1: "#e2231a",
  L2: "#f4c430",
  L3: "#8f5a2a",
  L4: "#2368b4",
  L4A: "#35a8e0",
  L5: "#34a853",
  L6: "#8d4bb3",
  L7: "#888888",
};

export const OD_COLORS = [
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

export const DECISION_COLORS = {
  pilot: "#ff4fb8",
  feeder: "#ff3131",
  structure: "#ffb703",
  context: "#14101c",
};

export const STRUCTURE_COLORS = {
  high: "#9d4edd",
  veryHigh: "#ff4fb8",
  extreme: "#ffb703",
  residual: "#ff3131",
};

export const DECISION_LABELS = {
  pilot: "Piloto Metro nocturno",
  feeder: "Alimentador nocturno",
  structure: "Estructura de demanda",
};

export const DECISION_MODES = new Set(["decision", "pilot", "feeder", "structure"]);

export const PILOT_STATION_MAX_CORRIDOR_M = 800;
export const PILOT_CELL_MAX_STATION_M = 500;

export const DETERMINANT_VARIABLES = [
  {
    key: "beneficiarios_tp",
    label: "Usuarios TP censales",
    shortLabel: "Usuarios TP",
    format: "number",
    color: "#ff4fb8",
    rationale: "Masa potencial de personas que ya dependen del transporte público.",
  },
  {
    key: "pct_transporte_publico_h3",
    label: "Uso TP habitual",
    shortLabel: "TP habitual",
    format: "pct",
    color: "#ffd166",
    rationale: "Dependencia modal del transporte público en la celda.",
  },
  {
    key: "densidad_poblacion_h3",
    label: "Densidad poblacional",
    shortLabel: "Densidad",
    format: "density",
    transform: "log1p",
    color: "#9d4edd",
    rationale: "Intensidad urbana y masa de viajes posibles.",
  },
  {
    key: "pct_vivienda_departamento_h3",
    label: "Vivienda en depto.",
    shortLabel: "Vivienda depto.",
    format: "pct",
    color: "#c77dff",
    rationale: "Proxy de centralidad, compacidad y mezcla urbana.",
  },
  {
    key: "pct_personas_18_44_h3",
    label: "Población 18-44",
    shortLabel: "18-44 años",
    format: "pct",
    color: "#f72585",
    rationale: "Grupo etario con alta movilidad laboral, social y recreativa.",
  },
  {
    key: "pct_ocupaciones_servicios_operativas_h3",
    label: "Servicios/operativas",
    shortLabel: "Serv./oper.",
    format: "pct",
    color: "#ff3131",
    rationale: "Actividades laborales con mayor probabilidad de desplazamiento fuera de horario.",
  },
  {
    key: "dist_metro_m",
    label: "Cercanía a Metro",
    shortLabel: "Distancia Metro",
    format: "distance",
    transform: "inverseLog1p",
    color: "#ffb703",
    rationale: "Relación operativa con estaciones existentes y factibilidad de piloto.",
  },
];
