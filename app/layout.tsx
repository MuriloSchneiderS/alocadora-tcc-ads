import type { Metadata } from "next";
import Script from "next/script";
import { AuthProvider } from "./providers";
import "./globals.css";
import "video.js/dist/video-js.css";

export const metadata: Metadata = {
  title: "Alocadora",
  description: "Plataforma para publicação, aluguel e compra de mídias digitais.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-50">
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9486375314273706"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
