import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getAppConfig } from "@/lib/config";

const inter = Inter({ subsets: ["latin"] });

const themeInitializer = `(() => {
  try {
    const stored = localStorage.getItem("vllm_hust_theme");
    const theme = stored === "light" || stored === "dark"
      ? stored
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();`;

export async function generateMetadata(): Promise<Metadata> {
  const cfg = getAppConfig();
  return {
    title: cfg.brandName,
    description: "私有化 AI 工作站 · 数据不出境 · 国产算力",
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = getAppConfig();
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <head>
        <style>{`:root { --accent: ${cfg.accentColor}; }`}</style>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body className={`${inter.className} app-body antialiased`}>
        {children}
      </body>
    </html>
  );
}
