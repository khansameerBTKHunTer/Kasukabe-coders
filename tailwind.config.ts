import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#f4f6f8",
        foreground: "#172b3a",
        card: {
          DEFAULT: "#ffffff",
          foreground: "#172b3a",
          border: "#e2e8f0",
        },
        popover: {
          DEFAULT: "#ffffff",
          foreground: "#172b3a",
        },
        primary: {
          DEFAULT: "#2563eb", // Sky / cyan accent
          foreground: "#ffffff",
          hover: "#1d4ed8",
        },
        secondary: {
          DEFAULT: "#f1f5f9",
          foreground: "#94a3b8",
        },
        muted: {
          DEFAULT: "#f1f5f9",
          foreground: "#64748b",
        },
        accent: {
          DEFAULT: "#2563eb",
          foreground: "#172b3a",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#172b3a",
        },
        border: "#e2e8f0",
        input: "#f8fafc",
        ring: "#38bdf8",
        // Disaster severity status bands
        severity: {
          critical: "#ef4444", // Red (80-100)
          high: "#f97316", // Orange (60-79.99)
          medium: "#eab308", // Amber (35-59.99)
          low: "#10b981", // Emerald (0-34.99)
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      boxShadow: {
        glow: "0 1px 3px rgba(23, 43, 58, 0.08)",
        "critical-glow": "0 1px 3px rgba(23, 43, 58, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
