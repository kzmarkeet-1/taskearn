import type { MetadataRoute } from "next";

const ROUTES = [
  "",
  "/how-it-works",
  "/earn",
  "/surveys",
  "/advertisers",
  "/faq",
  "/about",
  "/contact",
  "/login",
  "/register",
  "/terms",
  "/privacy",
  "/responsible-earnings",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const now = new Date();
  return ROUTES.map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
