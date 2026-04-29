import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DJ Booker Pro",
  description: "Gestion DJ — Calendrier, Clients, Facturation",
};

export default function WebLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
