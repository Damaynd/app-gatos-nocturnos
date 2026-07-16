"use client";

import { useEffect } from "react";
import PixelCat from "./components/PixelCat";

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
            Herramienta de análisis territorial para explorar la demanda de transporte público durante el horario no
            operativo de Metro (aprox. 23:00-06:00) y orientar decisiones sobre estaciones piloto, alimentadores
            nocturnos y núcleos de demanda.
          </p>
          <p className="project-statement">
            Proyecto desarrollado para CC5216 - Ciencia de Datos Geográficos, Universidad de Chile. Construido
            mayoritariamente con apoyo de IA, con curaduría, análisis y revisión humana.
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
            <button data-mode="structure">Estructura de demanda</button>
            <button data-mode="lisa">LISA</button>
          </div>
        </section>

        <section className="decision-brief" aria-label="Lectura operativa">
          <strong>Lectura rápida</strong>
          <span>Rosado: estaciones piloto. Rojo: alimentador nocturno. Estructura usa violeta, rosado, ámbar y rojo según demanda.</span>
        </section>

        <section className="panel-section determinants" aria-label="Variables seleccionadas">
          <h2>Variables seleccionadas</h2>
          <p className="determinant-copy">
            Se priorizan variables interpretables y accionables: dependencia del transporte público, intensidad
            urbana, perfil de movilidad nocturna y relación con Metro. Se dejan fuera variables redundantes, muy
            correlacionadas entre sí, con baja señal territorial o poco útiles para decidir la operación nocturna.
          </p>
          <p className="correlation-meta" id="correlationMeta">Correlación con demanda nocturna.</p>
          <div id="correlationChart" className="correlation-chart"></div>
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
            <input type="range" id="opacitySlider" min="20" max="90" defaultValue="68" />
          </label>
        </section>

        <section className="panel-section">
          <h2>Focos sugeridos</h2>
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
              <g id="h3GlowGroup"></g>
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
          <div className="detail-actions">
            <button id="zoomPriority">Ver sugeridas</button>
          </div>
        </aside>

        <div className="legend" id="legend"></div>
      </section>
    </main>
  );
}
