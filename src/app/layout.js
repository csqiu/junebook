import "./globals.css";

export const metadata = {
  title: "Junebook · Chinese Picture Book",
  description: "AI-generated Chinese picture books for children",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
