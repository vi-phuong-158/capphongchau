import type { MetadataRoute } from "next";
import { appMetadata } from "@/lib/app-metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appMetadata.name,
    short_name: appMetadata.shortName,
    description: appMetadata.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#1f6b45",
    lang: "vi-VN",
    icons: [
      {
        src: "/logo-phongchau.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
