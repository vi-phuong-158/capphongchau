import type { Metadata } from "next";
import { PwaRegister } from "@/components/pwa-register";
import { appMetadata } from "@/lib/app-metadata";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: appMetadata.name,
    template: `%s | ${appMetadata.shortName}`,
  },
  description: appMetadata.description,
  applicationName: appMetadata.shortName,
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
