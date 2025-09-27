import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SenRyde Admin",
  description: "Ride-hailing admin dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{background:"#f6f7fb", color:"#111", fontFamily:"system-ui"}}>
        {children}
      </body>
    </html>
  );
}
