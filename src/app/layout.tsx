import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import { appMetadata } from "@/lib/app-metadata";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

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
    <html lang="vi" className={beVietnamPro.variable}>
      <body className={beVietnamPro.className}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
