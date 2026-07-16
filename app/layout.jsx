import "../src/styles.css";

export const metadata = {
  title: "Gatos Nocturnos | CC5216 Ciencia de Datos Geográficos",
  description:
    "Aplicación para visualizar el contexto del transporte público en horarios no operativos de Metro, aprox. 23:00-06:00, desarrollada mayoritariamente con apoyo de IA para CC5216 - Ciencia de Datos Geográficos, Universidad de Chile.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
