import type { Metadata } from "next";
import "./globals.css";

export const viewport = {
  themeColor: "#1d4ed8",
};

export const metadata: Metadata = {
  title: "DJ Booker Pro",
  description: "Application de gestion pour DJ professionnel",
  applicationName: "DJ Booker Pro",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DJ Booker Pro",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/icons/icon-maskable.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
