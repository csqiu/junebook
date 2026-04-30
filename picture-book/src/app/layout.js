import "./globals.css";

export const metadata = {
  title: "小故事书 · Chinese Picture Book",
  description: "AI-generated Chinese picture books for children",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
