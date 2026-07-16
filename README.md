# Gatos Nocturnos

Aplicación Next.js para visualizar el contexto del transporte público en horarios no operativos de Metro (aprox. 23:00-06:00), usando celdas H3, corredores OD, estaciones y métricas territoriales en Santiago.

El proyecto fue desarrollado para CC5216 - Ciencia de Datos Geográficos, Universidad de Chile. La mayor parte del desarrollo de la aplicación se realizó con apoyo de herramientas de IA, con curaduría, análisis y revisión humana.

## Objetivo

Gatos Nocturnos busca apoyar la lectura territorial de la demanda nocturna de transporte público cuando Metro no se encuentra operativo. La aplicación cruza demanda estimada, cercanía a estaciones, corredores OD y clusters LISA para orientar tres preguntas de decisión:

- ¿Qué estaciones podrían operar primero en un piloto de Metro nocturno?
- ¿Dónde convendría implementar alimentadores nocturnos?
- ¿Dónde se estructura la demanda nocturna más relevante?

## Lectura de la aplicación

La interfaz principal contiene un mapa H3 y un panel de decisión. Cada vista activa una lectura distinta:

- **Vista ejecutiva:** resume las zonas sugeridas según su rol operativo.
- **Piloto Metro:** destaca celdas cercanas a estaciones y corredores OD de alta demanda.
- **Alimentador:** identifica celdas con demanda relevante fuera del radio caminable de Metro.
- **Estructura demanda:** muestra matices de intensidad para distinguir las celdas más solicitadas.
- **LISA:** permite revisar patrones de autocorrelación espacial. HH, LH y HL se interpretan como señales activas; LL y las celdas no significativas quedan como contexto sin foco operativo.

Las capas de apoyo permiten activar o desactivar estaciones de Metro, corredores OD, límites comunales y el filtro de zonas sugeridas. También se puede cambiar el escenario entre promedio, día laboral y fin de semana.

El panel de variables seleccionadas muestra la correlación de cada variable retenida con la demanda nocturna del escenario activo. Estas variables fueron elegidas por su interpretación territorial y operativa; se dejaron fuera campos redundantes, altamente correlacionados entre sí, con baja señal o poco útiles para decidir operación nocturna.

## Datos incluidos

Los datos necesarios para probar la aplicación ya están incluidos en `public/data`. No es necesario ejecutar scripts de preparación para abrir la app localmente.

Archivos principales:

- `h3_cells.geojson`: celdas H3 con métricas territoriales y de demanda.
- `metro_stations.geojson`: estaciones de Metro usadas como referencia espacial.
- `metro_segments.geojson`: trazado de apoyo de la red Metro.
- `od_corridors.geojson`: corredores origen-destino priorizados.
- `comunas.geojson`: límites comunales.
- `summary.json`: métricas agregadas para el panel.

## Requisitos

- Node.js 20 o superior.
- npm, incluido normalmente con Node.js.

## Instalación

Clona el repositorio e instala las dependencias:

```bash
git clone https://github.com/Damaynd/app-gatos-nocturnos.git
cd app-gatos-nocturnos
npm install
```

## Ejecutar en desarrollo

Inicia el servidor local:

```bash
npm run dev
```

Luego abre:

```text
http://127.0.0.1:3000
```

Si el puerto 3000 está ocupado, Next.js puede sugerir otro puerto disponible en la terminal.

## Compilar para producción

Genera el build optimizado:

```bash
npm run build
```

Para levantar el build compilado:

```bash
npm start
```

## Estructura del proyecto

```text
app/              Página y metadata de Next.js.
src/app.js        Lógica de visualización, capas y métricas del mapa.
src/styles.css    Estilos de la interfaz.
public/data/      Datos geográficos y métricas usados por la aplicación.
```

## Consideraciones

La aplicación es una herramienta exploratoria de apoyo a la decisión. Sus resultados deben interpretarse como insumos analíticos para priorización territorial, no como una definición final de operación del sistema de transporte.
