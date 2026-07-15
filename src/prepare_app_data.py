from __future__ import annotations

import json
import math
import zipfile
from pathlib import Path

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, box


ROOT = Path(__file__).resolve().parents[2]
OUTDIR = ROOT / "images" / "analisis_avanzado_metro_nocturno"
APPDIR = ROOT / "metro-nocturno-app"
DATADIR = APPDIR / "data"

H3_LEVEL = 8
PERIODO = "2024-2025"

RUTA_H3 = OUTDIR / f"tabla-h3-{H3_LEVEL}-dtpm-sin-metro-{PERIODO}.csv"
RUTA_MODELO_H3 = OUTDIR / f"tabla-modelo-h3-{H3_LEVEL}-sin-metro-{PERIODO}.csv"
RUTA_LISA = OUTDIR / f"tabla-lisa-H3-{H3_LEVEL}-origen_por_1000_personas.csv"
RUTA_OD = OUTDIR / f"tabla-top-corredores-od-h3-{H3_LEVEL}-sin-metro-{PERIODO}.csv"
RUTA_CLUSTERS = OUTDIR / f"tabla-contexto-censal-clusters-prioridad-h3-{H3_LEVEL}-sin-metro-{PERIODO}.csv"
RUTA_CONTEXTO = OUTDIR / f"tabla-contexto-censal-prioridad-h3-{H3_LEVEL}-sin-metro-{PERIODO}.csv"
RUTA_GTFS = ROOT / "data" / "dtpm-raw" / "gtfs.zip"
RUTA_CARTO_COMUNAL = (
    ROOT
    / "data"
    / "censo2024-cartografia"
    / "Cartografia_censo2024_Pais_Comunal.parquet"
)
RUTA_TRAMOS_SEL = (
    OUTDIR / f"tabla-tramos-metro-colindantes-top10-od-h3-{H3_LEVEL}-sin-metro-{PERIODO}.csv"
)
RUTA_ESTACIONES_SEL = (
    OUTDIR
    / f"tabla-estaciones-metro-colindantes-top10-od-h3-{H3_LEVEL}-sin-metro-{PERIODO}.csv"
)


CATEGORIA_LABELS = {
    "Baja demanda local": "Baja demanda local",
    "Demanda con acceso Metro": "Demanda con acceso Metro",
    "Brecha fuera de 1000 m": "Brecha fuera de 1000 m",
    "Candidato piloto Metro": "Candidato piloto Metro",
    "Brecha alimentador nocturno": "Brecha alimentador nocturno",
    "Estación crítica": "Estación crítica",
}

VARIABLE_Y_OLS_APP = "log_tasa_origen_h3"
VARIABLES_OLS_APP = [
    "log_densidad_poblacion_h3",
    "pct_transporte_publico_h3",
    "pct_transporte_auto_h3",
    "pct_transporte_activo_h3",
    "pct_vivienda_departamento_h3",
    "pct_personas_18_44_h3",
    "pct_personas_60_mas_h3",
    "pct_personas_inmigrantes_h3",
    "pct_personas_educacion_terciaria_h3",
    "pct_ocupaciones_servicios_operativas_h3",
    "log_dist_metro_km",
    "tiene_metro_1000m",
    "n_estaciones_riel",
]


def clean_value(value):
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if not math.isfinite(float(value)):
            return None
        return float(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if pd.isna(value):
        return None
    return value


def feature_collection(features):
    return {"type": "FeatureCollection", "features": features}


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def h3_polygon(cell_id: str):
    boundary = h3.cell_to_boundary(cell_id)
    coords = [[float(lng), float(lat)] for lat, lng in boundary]
    coords.append(coords[0])
    return {"type": "Polygon", "coordinates": [coords]}


def h3_center(cell_id: str):
    lat, lng = h3.cell_to_latlng(cell_id)
    return float(lng), float(lat)


def metric_quantiles(df: pd.DataFrame, columns: list[str]):
    out = {}
    for col in columns:
        if col not in df.columns:
            continue
        series = pd.to_numeric(df[col], errors="coerce").replace([np.inf, -np.inf], np.nan)
        series = series.dropna()
        if series.empty:
            continue
        out[col] = {
            "min": float(series.min()),
            "p50": float(series.quantile(0.50)),
            "p75": float(series.quantile(0.75)),
            "p90": float(series.quantile(0.90)),
            "p95": float(series.quantile(0.95)),
            "p99": float(series.quantile(0.99)),
            "max": float(series.max()),
        }
    return out


def calcular_residuos_ols_contextual(h3_df: pd.DataFrame) -> pd.DataFrame:
    """Calcula residuos del modelo OLS contextual amplio usado en la app."""
    columnas = ["h3_cell_id", "n_per", VARIABLE_Y_OLS_APP] + VARIABLES_OLS_APP
    if any(col not in h3_df.columns for col in columnas):
        return pd.DataFrame(columns=["h3_cell_id", "residuos_ols_h3"])

    datos = h3_df[columnas].replace([np.inf, -np.inf], np.nan).copy()
    datos = datos[datos["n_per"].fillna(0).gt(0)].dropna(
        subset=[VARIABLE_Y_OLS_APP] + VARIABLES_OLS_APP
    )
    if len(datos) < len(VARIABLES_OLS_APP) + 2:
        return pd.DataFrame(columns=["h3_cell_id", "residuos_ols_h3"])

    x = datos[VARIABLES_OLS_APP].astype(float)
    x_std = x.std(ddof=0).replace(0, 1)
    x_modelo = (x - x.mean()) / x_std
    x_modelo.insert(0, "const", 1.0)
    y = datos[VARIABLE_Y_OLS_APP].astype(float).to_numpy()
    betas, *_ = np.linalg.lstsq(x_modelo.to_numpy(dtype=float), y, rcond=None)
    pred = x_modelo.to_numpy(dtype=float) @ betas
    return pd.DataFrame(
        {
            "h3_cell_id": datos["h3_cell_id"].astype(str),
            "residuos_ols_h3": y - pred,
        }
    )


def cargar_h3_con_lisa():
    h3_df = pd.read_csv(RUTA_H3)
    residuos_ols = calcular_residuos_ols_contextual(h3_df)
    if not residuos_ols.empty:
        h3_df = h3_df.drop(columns=["residuos_ols_h3"], errors="ignore").merge(
            residuos_ols, on="h3_cell_id", how="left"
        )
    lisa = pd.read_csv(
        RUTA_LISA,
        usecols=["h3_cell_id", "lisa_cluster", "lisa_pvalue", "lisa_sig"],
    )
    h3_df = h3_df.drop(columns=[c for c in ["lisa_cluster", "lisa_pvalue", "lisa_sig"] if c in h3_df])
    h3_df = h3_df.merge(lisa, on="h3_cell_id", how="left")

    centers = h3_df["h3_cell_id"].map(h3_center)
    h3_df["lon"] = centers.map(lambda xy: xy[0])
    h3_df["lat"] = centers.map(lambda xy: xy[1])
    h3_df["beneficiarios_tp"] = pd.to_numeric(
        h3_df.get("n_transporte_publico", 0), errors="coerce"
    ).fillna(0)
    h3_df["poblacion_total"] = pd.to_numeric(h3_df.get("n_per", 0), errors="coerce").fillna(0)
    h3_df["viajes_total_dia_promedio"] = pd.to_numeric(
        h3_df.get("viajes_total_dia_promedio", 0), errors="coerce"
    ).fillna(0)
    h3_df["demanda_potencial_metro"] = np.where(
        h3_df["categoria_prioridad"].isin(["Demanda con acceso Metro", "Candidato piloto Metro", "Estación crítica"]),
        h3_df["viajes_total_dia_promedio"],
        0,
    )
    h3_df["demanda_potencial_alimentador"] = np.where(
        h3_df["categoria_prioridad"].isin(["Brecha fuera de 1000 m", "Brecha alimentador nocturno"]),
        h3_df["viajes_total_dia_promedio"],
        0,
    )
    return h3_df


def cargar_comunas(h3_df: pd.DataFrame):
    if not RUTA_CARTO_COMUNAL.exists():
        return None
    carto = gpd.read_parquet(RUTA_CARTO_COMUNAL, filters=[("COD_REGION", "=", 13)])
    carto = carto.to_crs("EPSG:4326")
    if carto.geometry.name != "geometry":
        carto = carto.rename_geometry("geometry")

    min_lon, min_lat = h3_df[["lon", "lat"]].min()
    max_lon, max_lat = h3_df[["lon", "lat"]].max()
    area = gpd.GeoDataFrame(
        geometry=[box(min_lon - 0.05, min_lat - 0.05, max_lon + 0.05, max_lat + 0.05)],
        crs="EPSG:4326",
    )
    carto = carto[carto.intersects(area.geometry.iloc[0])].copy()
    carto["geometry"] = carto.geometry.simplify(0.001, preserve_topology=True)
    return carto[["CUT", "COMUNA", "geometry"]]


def asignar_comuna(h3_df: pd.DataFrame, comunas: gpd.GeoDataFrame | None):
    if comunas is None or comunas.empty:
        h3_df["comuna"] = None
        return h3_df
    puntos = gpd.GeoDataFrame(
        h3_df[["h3_cell_id", "lon", "lat"]],
        geometry=gpd.points_from_xy(h3_df["lon"], h3_df["lat"]),
        crs="EPSG:4326",
    )
    joined = gpd.sjoin(puntos, comunas[["COMUNA", "geometry"]], how="left", predicate="within")
    comunas_por_h3 = joined.dropna(subset=["COMUNA"]).drop_duplicates("h3_cell_id").set_index("h3_cell_id")["COMUNA"]
    h3_df["comuna"] = h3_df["h3_cell_id"].map(comunas_por_h3)
    return h3_df


def exportar_h3(h3_df: pd.DataFrame):
    columnas = [
        "h3_cell_id",
        "comuna",
        "lon",
        "lat",
        "viajes_origen",
        "viajes_destino",
        "viajes_total",
        "viajes_origen_dia_promedio",
        "viajes_destino_dia_promedio",
        "viajes_total_dia_promedio",
        "viajes_origen_dia_laboral",
        "viajes_destino_dia_laboral",
        "viajes_total_dia_laboral",
        "viajes_origen_dia_fin_semana",
        "viajes_destino_dia_fin_semana",
        "viajes_total_dia_fin_semana",
        "origen_por_1000_personas",
        "destino_por_1000_personas",
        "viajes_total_por_1000_personas",
        "poblacion_total",
        "beneficiarios_tp",
        "pct_transporte_publico_h3",
        "pct_transporte_auto_h3",
        "pct_transporte_activo_h3",
        "pct_vivienda_departamento_h3",
        "pct_personas_inmigrantes_h3",
        "pct_personas_18_44_h3",
        "pct_personas_60_mas_h3",
        "pct_personas_educacion_terciaria_h3",
        "pct_ocupaciones_servicios_operativas_h3",
        "densidad_poblacion_h3",
        "dist_metro_m",
        "tiene_metro_1000m",
        "n_estaciones_riel",
        "n_estaciones_metro",
        "n_estaciones_metrotren",
        "banda_dist_metro",
        "nivel_demanda_h3",
        "demanda_distancia_metro",
        "categoria_prioridad",
        "es_celda_prioritaria",
        "cluster_prioridad",
        "tamano_cluster_prioridad",
        "lisa_cluster",
        "lisa_pvalue",
        "lisa_sig",
        "score_piloto_metro",
        "score_brecha_cobertura",
        "demanda_potencial_metro",
        "demanda_potencial_alimentador",
        "residuos_ols_h3",
    ]
    disponibles = [c for c in columnas if c in h3_df.columns]
    features = []
    for row in h3_df[disponibles].to_dict(orient="records"):
        cell_id = row["h3_cell_id"]
        props = {key: clean_value(value) for key, value in row.items()}
        props["h3_short"] = str(cell_id)[-7:]
        props["categoria_prioridad_label"] = CATEGORIA_LABELS.get(
            props.get("categoria_prioridad"), props.get("categoria_prioridad")
        )
        features.append(
            {
                "type": "Feature",
                "geometry": h3_polygon(str(cell_id)),
                "properties": props,
            }
        )
    write_json(DATADIR / "h3_cells.geojson", feature_collection(features))


def exportar_comunas(comunas: gpd.GeoDataFrame | None):
    if comunas is None or comunas.empty:
        write_json(DATADIR / "comunas.geojson", feature_collection([]))
        return
    payload = json.loads(comunas.to_json(drop_id=True))
    write_json(DATADIR / "comunas.geojson", payload)


def cargar_gtfs_metro():
    if not RUTA_GTFS.exists():
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"), gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    with zipfile.ZipFile(RUTA_GTFS) as zf:
        stops = pd.read_csv(zf.open("stops.txt"), dtype=str)
        routes = pd.read_csv(zf.open("routes.txt"), dtype=str)
        trips = pd.read_csv(zf.open("trips.txt"), dtype=str)
        stop_times = pd.read_csv(
            zf.open("stop_times.txt"),
            dtype=str,
            usecols=["trip_id", "stop_id", "stop_sequence"],
        )

    rutas_metro = routes[routes["route_type"].astype(str).eq("1")].copy()
    rutas_metro["linea"] = rutas_metro.get("route_short_name", rutas_metro["route_id"]).fillna(
        rutas_metro["route_id"]
    )
    trips_metro = trips.merge(rutas_metro[["route_id", "linea"]], on="route_id", how="inner")
    st = stop_times.merge(trips_metro[["trip_id", "linea"]], on="trip_id", how="inner")
    st["stop_sequence"] = pd.to_numeric(st["stop_sequence"], errors="coerce")
    st = st.dropna(subset=["stop_sequence"]).sort_values(["trip_id", "stop_sequence"])

    stops_idx = stops.set_index("stop_id", drop=False)

    def parent_station(stop_id):
        if stop_id not in stops_idx.index:
            return stop_id
        parent = stops_idx.at[stop_id, "parent_station"] if "parent_station" in stops_idx.columns else None
        if pd.notna(parent) and str(parent).strip() and parent in stops_idx.index:
            return parent
        return stop_id

    st["station_id"] = st["stop_id"].map(parent_station)
    estacion_lineas: dict[str, set[str]] = {}
    for _, row in st[["station_id", "linea"]].drop_duplicates().iterrows():
        estacion_lineas.setdefault(row["station_id"], set()).add(str(row["linea"]))

    station_ids = sorted(estacion_lineas)
    estaciones = stops_idx.loc[stops_idx.index.intersection(station_ids)].copy()
    estaciones["stop_lat"] = pd.to_numeric(estaciones["stop_lat"], errors="coerce")
    estaciones["stop_lon"] = pd.to_numeric(estaciones["stop_lon"], errors="coerce")
    estaciones = estaciones.dropna(subset=["stop_lat", "stop_lon"]).copy()
    estaciones["station_id"] = estaciones["stop_id"].astype(str)
    estaciones["nombre_estacion"] = estaciones["stop_name"].astype(str)
    estaciones["lineas_metro"] = estaciones["station_id"].map(
        lambda sid: ";".join(sorted(estacion_lineas.get(str(sid), [])))
    )
    estaciones_gdf = gpd.GeoDataFrame(
        estaciones[["station_id", "nombre_estacion", "lineas_metro"]],
        geometry=gpd.points_from_xy(estaciones["stop_lon"], estaciones["stop_lat"]),
        crs="EPSG:4326",
    )

    coords = dict(zip(estaciones_gdf["station_id"], estaciones_gdf.geometry))
    nombres = dict(zip(estaciones_gdf["station_id"], estaciones_gdf["nombre_estacion"]))
    lineas = dict(zip(estaciones_gdf["station_id"], estaciones_gdf["lineas_metro"]))
    segmentos = {}
    for _, group in st.groupby("trip_id"):
        group = group.drop_duplicates("station_id").sort_values("stop_sequence")
        ids = group["station_id"].astype(str).tolist()
        linea = str(group["linea"].iloc[0])
        for a, b in zip(ids[:-1], ids[1:]):
            if a == b or a not in coords or b not in coords:
                continue
            key = tuple(sorted([linea, a, b]))
            if key in segmentos:
                continue
            segmentos[key] = {
                "linea": linea,
                "u_id": a,
                "v_id": b,
                "estacion_a": nombres.get(a, a),
                "estacion_b": nombres.get(b, b),
                "lineas_estacion_a": lineas.get(a, ""),
                "lineas_estacion_b": lineas.get(b, ""),
                "geometry": LineString([coords[a], coords[b]]),
            }

    tramos = gpd.GeoDataFrame(list(segmentos.values()), geometry="geometry", crs="EPSG:4326")
    return tramos, estaciones_gdf


def exportar_metro():
    tramos, estaciones = cargar_gtfs_metro()

    tramos_sel = pd.read_csv(RUTA_TRAMOS_SEL) if RUTA_TRAMOS_SEL.exists() else pd.DataFrame()
    estaciones_sel = pd.read_csv(RUTA_ESTACIONES_SEL) if RUTA_ESTACIONES_SEL.exists() else pd.DataFrame()

    if not tramos.empty and not tramos_sel.empty:
        claves = {
            tuple(sorted([str(row.linea), str(row.u_id), str(row.v_id)]))
            for row in tramos_sel.itertuples(index=False)
        }
        tramos["es_tramo_colindante_top10"] = [
            tuple(sorted([str(row.linea), str(row.u_id), str(row.v_id)])) in claves
            for row in tramos.itertuples(index=False)
        ]
        tramos = tramos.merge(
            tramos_sel.drop(columns=[c for c in ["geometry"] if c in tramos_sel], errors="ignore"),
            on=["linea", "u_id", "v_id"],
            how="left",
            suffixes=("", "_sel"),
        )
    elif not tramos.empty:
        tramos["es_tramo_colindante_top10"] = False

    if not estaciones.empty and not estaciones_sel.empty:
        estaciones = estaciones.merge(
            estaciones_sel,
            on=["station_id", "nombre_estacion", "lineas_metro"],
            how="left",
        )
        estaciones["es_estacion_colindante_top10"] = estaciones["criterio_seleccion"].notna()
    elif not estaciones.empty:
        estaciones["es_estacion_colindante_top10"] = False

    write_json(
        DATADIR / "metro_segments.geojson",
        json.loads(tramos.to_json(drop_id=True)) if not tramos.empty else feature_collection([]),
    )
    write_json(
        DATADIR / "metro_stations.geojson",
        json.loads(estaciones.to_json(drop_id=True)) if not estaciones.empty else feature_collection([]),
    )


def exportar_od():
    if not RUTA_OD.exists():
        write_json(DATADIR / "od_corridors.geojson", feature_collection([]))
        return pd.DataFrame()
    od = pd.read_csv(RUTA_OD)
    od = od.head(30).copy()
    od["geometry"] = [
        LineString([(row.lon_origen, row.lat_origen), (row.lon_destino, row.lat_destino)])
        for row in od.itertuples(index=False)
    ]
    gdf = gpd.GeoDataFrame(od, geometry="geometry", crs="EPSG:4326")
    write_json(DATADIR / "od_corridors.geojson", json.loads(gdf.to_json(drop_id=True)))
    return od


def exportar_clusters():
    clusters = pd.read_csv(RUTA_CLUSTERS) if RUTA_CLUSTERS.exists() else pd.DataFrame()
    if clusters.empty:
        payload = []
    else:
        clusters = clusters.sort_values("viajes_total", ascending=False)
        payload = [
            {key: clean_value(value) for key, value in row.items()}
            for row in clusters.to_dict(orient="records")
        ]
    write_json(DATADIR / "clusters.json", payload)
    return clusters


def exportar_contexto():
    contexto = pd.read_csv(RUTA_CONTEXTO) if RUTA_CONTEXTO.exists() else pd.DataFrame()
    payload = [
        {key: clean_value(value) for key, value in row.items()}
        for row in contexto.to_dict(orient="records")
    ]
    write_json(DATADIR / "contexto_prioridad.json", payload)
    return contexto


def sum_columns(df: pd.DataFrame, columns: list[str]):
    return {
        col: float(pd.to_numeric(df[col], errors="coerce").fillna(0).sum())
        for col in columns
        if col in df.columns
    }


def exportar_resumen(h3_df: pd.DataFrame, od: pd.DataFrame, clusters: pd.DataFrame, contexto: pd.DataFrame):
    total = h3_df
    prioritarias = h3_df[h3_df["es_celda_prioritaria"].fillna(0).astype(float).gt(0)]
    cerca_metro = h3_df[h3_df["tiene_metro_1000m"].fillna(0).astype(float).gt(0)]
    fuera_metro = h3_df[h3_df["tiene_metro_1000m"].fillna(0).astype(float).eq(0)]

    def bloque(df):
        return {
            "celdas": int(len(df)),
            "poblacion": float(pd.to_numeric(df.get("poblacion_total", 0), errors="coerce").fillna(0).sum()),
            "beneficiarios_tp": float(pd.to_numeric(df.get("beneficiarios_tp", 0), errors="coerce").fillna(0).sum()),
            "viajes_total_dia_promedio": float(pd.to_numeric(df.get("viajes_total_dia_promedio", 0), errors="coerce").fillna(0).sum()),
            "viajes_origen_dia_promedio": float(pd.to_numeric(df.get("viajes_origen_dia_promedio", 0), errors="coerce").fillna(0).sum()),
            "viajes_destino_dia_promedio": float(pd.to_numeric(df.get("viajes_destino_dia_promedio", 0), errors="coerce").fillna(0).sum()),
            "viajes_total_dia_laboral": float(pd.to_numeric(df.get("viajes_total_dia_laboral", 0), errors="coerce").fillna(0).sum()),
            "viajes_total_dia_fin_semana": float(pd.to_numeric(df.get("viajes_total_dia_fin_semana", 0), errors="coerce").fillna(0).sum()),
            "demanda_potencial_metro": float(pd.to_numeric(df.get("demanda_potencial_metro", 0), errors="coerce").fillna(0).sum()),
            "demanda_potencial_alimentador": float(pd.to_numeric(df.get("demanda_potencial_alimentador", 0), errors="coerce").fillna(0).sum()),
            "estaciones": float(pd.to_numeric(df.get("n_estaciones_riel", 0), errors="coerce").fillna(0).sum()),
            "dist_metro_m_pond_viajes": float(
                np.average(
                    pd.to_numeric(df.get("dist_metro_m", 0), errors="coerce").fillna(0),
                    weights=np.maximum(pd.to_numeric(df.get("viajes_total_dia_promedio", 0), errors="coerce").fillna(0), 1e-9),
                )
            )
            if len(df) > 0
            else 0,
        }

    categorias = []
    for cat, group in h3_df.groupby("categoria_prioridad", dropna=False):
        fila = bloque(group)
        fila["categoria"] = clean_value(cat)
        categorias.append(fila)

    summary = {
        "periodo": PERIODO,
        "h3_level": H3_LEVEL,
        "hipotesis": "La demanda nocturna no Metro aumenta en zonas con dependencia de transporte público, intensidad urbana y relación funcional con la red Metro.",
        "totales": bloque(total),
        "prioritarias": bloque(prioritarias),
        "cerca_metro_1000m": bloque(cerca_metro),
        "fuera_metro_1000m": bloque(fuera_metro),
        "categorias": sorted(categorias, key=lambda x: x["viajes_total_dia_promedio"], reverse=True),
        "metricas": metric_quantiles(
            h3_df,
            [
                "viajes_total_dia_promedio",
                "viajes_total_dia_laboral",
                "viajes_total_dia_fin_semana",
                "origen_por_1000_personas",
                "beneficiarios_tp",
                "dist_metro_m",
                "score_piloto_metro",
                "score_brecha_cobertura",
                "residuos_ols_h3",
            ],
        ),
        "top_corredores": [
            {key: clean_value(value) for key, value in row.items()}
            for row in od.head(10).drop(columns="geometry", errors="ignore").to_dict(orient="records")
        ]
        if not od.empty
        else [],
        "top_clusters": [
            {key: clean_value(value) for key, value in row.items()}
            for row in clusters.head(8).to_dict(orient="records")
        ]
        if not clusters.empty
        else [],
        "contexto_prioridad": [
            {key: clean_value(value) for key, value in row.items()}
            for row in contexto.to_dict(orient="records")
        ]
        if not contexto.empty
        else [],
    }
    write_json(DATADIR / "summary.json", summary)


def main():
    DATADIR.mkdir(parents=True, exist_ok=True)
    h3_df = cargar_h3_con_lisa()
    comunas = cargar_comunas(h3_df)
    h3_df = asignar_comuna(h3_df, comunas)
    exportar_h3(h3_df)
    exportar_comunas(comunas)
    exportar_metro()
    od = exportar_od()
    clusters = exportar_clusters()
    contexto = exportar_contexto()
    exportar_resumen(h3_df, od, clusters, contexto)
    print(f"Datos de la app generados en {DATADIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
