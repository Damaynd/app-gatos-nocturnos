import "../src/styles.css";

export const metadata = {
  title: "Gatos Nocturnos | CC5216 Ciencia de Datos Geográficos",
  description:
    "Herramienta de análisis territorial para explorar la demanda de transporte público en horario no operativo de Metro (aprox. 23:00-06:00), desarrollada para CC5216 - Ciencia de Datos Geográficos, Universidad de Chile.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
