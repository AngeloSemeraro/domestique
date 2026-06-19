import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strava Batch Editor",
  description: "Edit multiple Strava activities at once",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
