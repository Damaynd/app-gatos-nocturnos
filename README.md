# Gatos Nocturnos

Gatos Nocturnos es una aplicación Next.js de análisis territorial para explorar la demanda de transporte público en Santiago durante el horario no operativo de Metro (aprox. 23:00-06:00). La app combina celdas H3, corredores origen-destino, estaciones, clusters LISA y métricas territoriales para apoyar decisiones sobre Metro nocturno, alimentadores y núcleos de demanda.

Proyecto desarrollado para CC5216 - Ciencia de Datos Geográficos, Universidad de Chile. La aplicación fue construida mayoritariamente con apoyo de herramientas de IA, con curaduría, análisis y revisión humana.

## Objetivo

El objetivo del proyecto es transformar datos territoriales y de movilidad nocturna en una lectura operativa para responder tres preguntas de decisión:

- ¿Qué estaciones deberían considerarse primero para operar en un piloto de Metro nocturno?
- ¿Dónde convendría implementar servicios alimentadores nocturnos?
- ¿Dónde se estructura la demanda nocturna más relevante?

La aplicación no busca definir una operación final del sistema de transporte. Su propósito es entregar evidencia exploratoria para priorizar zonas, contrastar hipótesis y comunicar patrones espaciales de forma clara.

## Lectura de la aplicación

La interfaz principal contiene un mapa H3 y un panel de decisión. Cada vista activa una lectura distinta:

- **Vista ejecutiva:** integra las señales principales y clasifica las zonas sugeridas según su rol operativo.
- **Piloto Metro:** destaca celdas cercanas a estaciones vinculadas a corredores origen-destino de alta demanda.
- **Alimentador:** identifica celdas con demanda relevante fuera del radio caminable de Metro.
- **Estructura de demanda:** ordena núcleos de demanda por intensidad, señal LISA y residuo alto.
- **LISA:** permite revisar patrones de autocorrelación espacial. HH, LH y HL se interpretan como señales activas; LL y las celdas no significativas quedan como contexto y no como foco operativo.

Las capas de apoyo permiten activar o desactivar estaciones de Metro, corredores origen-destino, límites comunales y el filtro de zonas sugeridas. También se puede cambiar el escenario entre promedio, día laboral y fin de semana.

El panel de variables seleccionadas reporta la correlación de Pearson de cada variable retenida con la demanda nocturna del escenario activo. Las variables se eligieron por su interpretabilidad territorial y utilidad operativa: dependencia del transporte público, intensidad urbana, perfil de movilidad nocturna y relación con Metro. Se excluyeron variables redundantes, altamente colineales, con baja señal territorial o poco accionables para decisiones de operación nocturna.

Al pasar el mouse sobre una celda, la aplicación muestra métricas locales, clasificación LISA, distancia a Metro, puntajes operativos y el valor de las variables seleccionadas. El valor entre paréntesis indica la correlación de esa variable con la demanda nocturna del escenario activo.

## Datos incluidos

Los datos necesarios para probar la aplicación ya están incluidos en `public/data`. No es necesario ejecutar scripts de preparación, descargar archivos adicionales ni configurar credenciales para abrir la app localmente.

Archivos principales:

- `h3_cells.geojson`: celdas H3 con métricas territoriales y de demanda.
- `metro_stations.geojson`: estaciones de Metro usadas como referencia espacial.
- `metro_segments.geojson`: trazado de apoyo de la red Metro.
- `od_corridors.geojson`: corredores origen-destino priorizados.
- `comunas.geojson`: límites comunales.
- `summary.json`: métricas agregadas para el panel.

## Requisitos

- Git.
- Node.js 20.9 o superior.
- npm, incluido normalmente con Node.js.

## Instalación

Clona el repositorio e instala las dependencias:

```bash
git clone https://github.com/Damaynd/app-gatos-nocturnos.git
cd app-gatos-nocturnos
npm install
```

## Ejecutar en desarrollo

Inicia el servidor local de Next.js:

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

## Scripts disponibles

- `npm run dev`: inicia el entorno de desarrollo.
- `npm run build`: compila la aplicación para producción.
- `npm start`: ejecuta la versión compilada.

## Estructura del proyecto

```text
app/                 Página principal, layout y componentes de Next.js.
src/app.js           Lógica de visualización, capas, métricas y eventos del mapa.
src/config.js        Configuración de colores, variables, escenarios y umbrales.
src/styles.css       Estilos de la interfaz.
public/data/         Datos geográficos y métricas usados por la aplicación.
src/prepare_app_data.py  Script usado para preparar los datos de la app.
```

## Consideraciones

Gatos Nocturnos es una herramienta exploratoria de apoyo a la decisión. Sus resultados deben interpretarse como insumos analíticos para priorización territorial, no como una definición final de operación del sistema de transporte.
