export const theme = {
  colors: {
    surface: "#0F1014",
    onSurface: "#F5F5F0",
    surfaceSecondary: "#1A1B20",
    onSurfaceSecondary: "#D4D4D8",
    surfaceTertiary: "#27282D",
    onSurfaceTertiary: "#A1A1AA",
    brand: "#C89B3C",
    brandSecondary: "#8C6A21",
    brandTertiary: "rgba(200, 155, 60, 0.12)",
    onBrand: "#0F1014",
    border: "#27282D",
    borderStrong: "#3F4046",
    success: "#86EFAC",
    warning: "#FCD34D",
    error: "#FCA5A5",
    danger: "#4A1A1A",
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 4, md: 8, lg: 16, pill: 999 },
  fontSize: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32, display: 40 },
} as const;

export const formatCents = (cents: number) => `€${(cents / 100).toFixed(2)}`;
export const formatDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m`.trim() : `${m}min`);
