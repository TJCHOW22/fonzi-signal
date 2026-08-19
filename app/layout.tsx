import type { Metadata } from "next";
import { AppNavigation } from "@/components/navigation/app-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fonzi Content OS",
  description: "Local store + UI for the Fonzi content operating system",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <AppNavigation />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
