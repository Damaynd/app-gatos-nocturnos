import "../src/styles.css";

export const metadata = {
  title: "Metro nocturno Santiago | Observatorio H3-8",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

