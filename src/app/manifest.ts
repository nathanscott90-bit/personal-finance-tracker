import type { MetadataRoute } from "next";

/** Lets "Add to Home screen" on a phone open the compact view full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finance",
    short_name: "Finance",
    start_url: "/m",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
