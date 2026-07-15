"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    import("../src/app.js");
  }, []);

  return (
    <main className="app-shell">
      <section className="sidebar" aria-label="Panel analítico">
        <header className="brand">
          <p className="eyebrow">Santiago · H3-8 · DTPM 2024-2025</p>
          <h1>Observatorio de demanda nocturna no Metro</h1>
          <p className="lead">
            Hipótesis: la demanda nocturna no Metro aumenta en zonas con dependencia de transporte público, intensidad
            urbana y relación funcional con la red Metro.
          </p>
        </header>

        <section className="kpis" aria-label="Indicadores principales">
          <article>
            <span id="kpiPriorityCells">--</span>
            <small>celdas prioritarias</small>
          </article>
          <article>
            <span id="kpiPriorityPeople">--</span>
            <small>personas en prioridad</small>
          </article>
          <article>
            <span id="kpiPriorityTp">--</span>
            <small>usuarios TP censales</small>
          </article>
          <article>
            <span id="kpiPriorityDemand">--</span>
            <small>viajes/día no Metro</small>
          </article>
        </section>

        <section className="panel-section">
          <h2>Capa principal</h2>
          <div className="segmented" id="layerMode">
            <button className="active" data-mode="priority">
              Prioridad
            </button>
            <button data-mode="demand">Demanda</button>
            <button data-mode="rate">Tasa</button>
            <button data-mode="access">Acceso</button>
            <button data-mode="lisa">LISA</button>
            <button data-mode="beneficiaries">Beneficiarios</button>
            <button data-mode="ols">OLS</button>
          </div>
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
          <h2>Capas de contexto</h2>
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
            <input type="checkbox" id="togglePriorityOnly" /> Sólo celdas prioritarias
          </label>
          <div className="segmented compact" id="odLimitMode">
            <button data-od-limit="10">Top 10</button>
            <button data-od-limit="20">Top 20</button>
            <button className="active" data-od-limit="30">
              Top 30
            </button>
          </div>
          <label className="slider-label">
            Opacidad H3
            <input type="range" id="opacitySlider" min="25" max="95" defaultValue="76" />
          </label>
        </section>

        <section className="panel-section">
          <h2>Zonas contiguas</h2>
          <div id="clusterList" className="cluster-list"></div>
        </section>
      </section>

      <section className="map-wrap" aria-label="Mapa interactivo">
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
            <p className="eyebrow">Celda o selección</p>
            <h2 id="detailTitle">Panorama metropolitano</h2>
          </div>
          <div className="detail-grid" id="detailGrid"></div>
          <div className="detail-text" id="detailText"></div>
          <div className="selection-actions">
            <button id="clearSelection">Limpiar selección</button>
            <button id="zoomPriority">Ver prioridad</button>
          </div>
        </aside>

        <div className="legend" id="legend"></div>
      </section>
    </main>
  );
}
