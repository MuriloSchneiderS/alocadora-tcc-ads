import type { Metadata } from "next";
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
        {children}
      </body>
    </html>
  );
}
