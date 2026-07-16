# Gatos Nocturnos

Aplicación Next.js para explorar la demanda nocturna no Metro en Santiago con celdas H3, corredores OD, estaciones y métricas territoriales.

Este proyecto fue desarrollado para el curso de Ciencia de Datos Geográficos. La mayor parte del desarrollo de la aplicación se realizó con apoyo de herramientas de IA, con curaduría, análisis y revisión humana.

## Enfoque de decisión

La vista principal cruza demanda nocturna, distancia a Metro, estaciones existentes, corredores OD y clusters LISA para sugerir tres lecturas operativas:

- **Piloto Metro nocturno:** celdas alrededor de estaciones ubicadas a 800 m o menos de corredores OD top 10, y con demanda nocturna alta o señal LISA HH.
- **Alimentador nocturno:** celdas de demanda alta fuera del radio caminable de 1000 m, con brecha de cobertura y score consistente.
- **Estructura de demanda:** núcleos LISA HH/LH/HL y casos extremos p99 con residuo alto, coloreados por intensidad de demanda para distinguir las celdas más solicitadas.

La paleta visual usa tema oscuro con acentos neón. Los colores de las celdas codifican la categoría operativa y se mantienen estables; la intensidad de luz, halo y pulso varía según demanda y score operativo.

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
