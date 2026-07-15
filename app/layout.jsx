import "../src/styles.css";

export const metadata = {
  title: "Gatos Nocturnos | Ciencia de Datos Geográficos",
  description:
    "Aplicación de análisis territorial de demanda nocturna no Metro, desarrollada mayoritariamente con apoyo de IA para el curso de Ciencia de Datos Geográficos.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
