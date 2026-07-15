"use client";

import { useEffect } from "react";

function PixelCat({ className = "" }) {
  return (
    <svg className={`pixel-cat ${className}`} viewBox="0 0 16 12" aria-hidden="true" shapeRendering="crispEdges">
      <rect className="cat-glow" x="3" y="3" width="10" height="8" />
      <rect className="cat-fur" x="4" y="4" width="8" height="6" />
      <rect className="cat-fur" x="3" y="5" width="1" height="4" />
      <rect className="cat-fur" x="12" y="5" width="1" height="4" />
      <rect className="cat-fur" x="4" y="2" width="2" height="2" />
      <rect className="cat-fur" x="10" y="2" width="2" height="2" />
      <rect className="cat-tail" x="13" y="4" width="1" height="1" />
      <rect className="cat-tail" x="14" y="3" width="1" height="1" />
      <rect className="cat-tail" x="15" y="2" width="1" height="1" />
      <rect className="cat-eye" x="6" y="6" width="1" height="1" />
      <rect className="cat-eye" x="10" y="6" width="1" height="1" />
      <rect className="cat-nose" x="8" y="7" width="1" height="1" />
      <rect className="cat-collar" x="5" y="9" width="6" height="1" />
    </svg>
  );
}

export default function Home() {
  useEffect(() => {
    import("../src/app.js");
  }, []);

  return (
    <main className="app-shell">
      <div className="night-pixels" aria-hidden="true">
        <span className="pixel-star star-a"></span>
        <span className="pixel-star star-b"></span>
        <span className="pixel-star star-c"></span>
        <span className="pixel-star star-d"></span>
      </div>
      <section className="sidebar" aria-label="Panel analítico">
        <header className="brand">
          <PixelCat className="brand-cat" />
          <p className="eyebrow">Santiago · H3-8 · DTPM 2024-2025</p>
          <h1>Gatos Nocturnos</h1>
          <p className="lead">
            Mapa ejecutivo para priorizar pilotos de Metro nocturno, alimentadores y nodos de demanda fuera del horario
            operativo.
          </p>
          <p className="project-statement">
            Proyecto para Ciencia de Datos Geográficos, desarrollado principalmente con apoyo de IA y revisión humana.
          </p>
        </header>

        <section className="kpis" aria-label="Indicadores principales">
          <article>
            <span id="kpiPriorityCells">--</span>
            <small>zonas sugeridas</small>
          </article>
          <article>
            <span id="kpiPriorityPeople">--</span>
            <small>viajes priorizados</small>
          </article>
          <article>
            <span id="kpiPriorityTp">--</span>
            <small>potencial Metro</small>
          </article>
          <article>
            <span id="kpiPriorityDemand">--</span>
            <small>brecha alimentador</small>
          </article>
        </section>

        <section className="panel-section">
          <h2>Pregunta de decisión</h2>
          <div className="segmented" id="layerMode">
            <button className="active" data-mode="decision">
              Vista ejecutiva
            </button>
            <button data-mode="pilot">Piloto Metro</button>
            <button data-mode="feeder">Alimentador</button>
            <button data-mode="structure">Estructura demanda</button>
            <button data-mode="lisa">LISA</button>
          </div>
        </section>

        <section className="decision-brief" aria-label="Lectura operativa">
          <strong>Lectura rápida</strong>
          <span>Rosado: piloto Metro. Rojo: alimentador nocturno. Amarillo: núcleo estructural de demanda.</span>
        </section>

        <section className="panel-section">
          <h2>Periodo operativo</h2>
          <div className="segmented compact" id="scenarioMode">
            <button className="active" data-scenario="total">
              Promedio
            </button>
            <button data-scenario="laboral">Laboral</button>
            <button data-scenario="fin_semana">Fin de semana</button>
          </div>
        </section>

        <section className="panel-section toggles">
          <h2>Capas de apoyo</h2>
          <label>
            <input type="checkbox" id="toggleMetro" defaultChecked /> Estaciones Metro
          </label>
          <label>
            <input type="checkbox" id="toggleOD" defaultChecked /> Corredores OD
          </label>
          <label>
            <input type="checkbox" id="toggleComunas" defaultChecked /> Límites comunales
          </label>
          <label>
            <input type="checkbox" id="togglePriorityOnly" /> Sólo zonas sugeridas
          </label>
          <div className="segmented compact" id="odLimitMode">
            <button className="active" data-od-limit="10">Top 10</button>
            <button data-od-limit="20">Top 20</button>
            <button data-od-limit="30">Top 30</button>
          </div>
          <label className="slider-label">
            Intensidad H3
            <input type="range" id="opacitySlider" min="20" max="90" defaultValue="72" />
          </label>
        </section>

        <section className="panel-section">
          <h2>Áreas sugeridas</h2>
          <div id="clusterList" className="cluster-list"></div>
        </section>
      </section>

      <section className="map-wrap" aria-label="Mapa interactivo">
        <PixelCat className="map-cat map-cat-watermark" />
        <div id="map">
          <svg id="mapSvg" role="img" aria-label="Mapa H3-8 de Santiago">
            <defs>
              <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect id="mapBackground" x="0" y="0" width="100%" height="100%"></rect>
            <g id="mapViewport">
              <g id="comunaGroup"></g>
              <g id="h3Group"></g>
              <g id="odGroup"></g>
              <g id="metroGroup"></g>
              <g id="stationGroup"></g>
            </g>
          </svg>
          <div id="hoverTooltip" className="floating-tooltip"></div>
        </div>

        <aside className="detail-panel" aria-live="polite">
          <div className="detail-header">
            <p className="eyebrow">Lectura de decisión</p>
            <h2 id="detailTitle">Dónde actuar primero</h2>
          </div>
          <div className="detail-grid" id="detailGrid"></div>
          <div className="detail-text" id="detailText"></div>
          <div className="selection-actions">
            <button id="clearSelection">Limpiar selección</button>
            <button id="zoomPriority">Ver sugeridas</button>
          </div>
        </aside>

        <div className="legend" id="legend"></div>
      </section>
    </main>
  );
}
