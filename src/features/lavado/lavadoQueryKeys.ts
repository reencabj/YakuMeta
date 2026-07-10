export const lavadoQueryKeys = {
  config: ["lavado", "config"] as const,
  tandasActivas: ["lavado", "tandas", "activas"] as const,
  tandasHistorial: (page: number) => ["lavado", "tandas", "historial", page] as const,
  moneySummary: ["lavado", "money-summary"] as const,
};
