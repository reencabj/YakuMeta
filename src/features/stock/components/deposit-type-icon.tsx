import type { LucideIcon } from "lucide-react";
import { Car, Home, Plane, Ship, Truck, Warehouse } from "lucide-react";

/** Icono según slug del tipo de depósito (extensible). */
export function depositTypeIcon(slug: string): LucideIcon {
  const s = slug.toLowerCase();
  if (s.includes("casa") || s === "casa") return Home;
  if (s.includes("helic") || s.includes("heli")) return Plane;
  if (s.includes("camion") || s.includes("van") || s.includes("pickup")) return Truck;
  if (s.includes("auto") || s.includes("vehic")) return Car;
  if (s.includes("barco") || s.includes("lancha")) return Ship;
  return Warehouse;
}
