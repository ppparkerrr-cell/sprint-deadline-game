import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["cyrillic", "latin"], display: "swap" });

const siteUrl = "https://game.ireshev.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "ДЕДЛАЙН — игра про управление проектом",
  description: "Распредели команду по задачам, удержи бюджет и выпусти продукт за 18 недель.",
  applicationName: "ДЕДЛАЙН",
  openGraph: {
    title: "ДЕДЛАЙН",
    description: "Уложись в срок. Не сожги бюджет.",
    locale: "ru_RU",
    type: "website",
    url: siteUrl,
    images: [{ url: `${siteUrl}/deadline-og.png`, width: 1200, height: 630, alt: "ДЕДЛАЙН — игра про управление проектом" }],
  },
  twitter: { card: "summary_large_image", title: "ДЕДЛАЙН", description: "Игра-тренажёр проектного мышления", images: [`${siteUrl}/deadline-og.png`] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111318", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={manrope.variable}>{children}</body></html>;
}
