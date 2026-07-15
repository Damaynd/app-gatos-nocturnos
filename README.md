# Gatos Nocturnos

Aplicación Next.js para explorar la demanda nocturna no Metro en Santiago con celdas H3, corredores OD, estaciones y métricas territoriales.

Este proyecto fue desarrollado para el curso de Ciencia de Datos Geográficos. La mayor parte del desarrollo de la aplicación se realizó con apoyo de herramientas de IA, con curaduría, análisis y revisión humana.

## Enfoque de decisión

La vista principal cruza demanda nocturna, distancia a Metro, estaciones existentes, corredores OD y clusters LISA para sugerir tres lecturas operativas:

- **Piloto Metro nocturno:** zonas de alta demanda cerca de Metro o estaciones críticas.
- **Alimentador nocturno:** zonas de alta demanda fuera del radio caminable de 1000 m.
- **Estructura de demanda:** núcleos LISA o celdas de demanda muy alta que ayudan a ordenar la red nocturna.

## Desarrollo

```bash
npm install
npm run dev
```

Luego abre `http://127.0.0.1:3000`.

## Producción

```bash
npm run build
npm start
```
