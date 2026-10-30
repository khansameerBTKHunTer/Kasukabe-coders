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
        background: "#0a0d14",
        foreground: "#f1f5f9",
        card: {
          DEFAULT: "rgba(15, 23, 42, 0.75)",
          foreground: "#f8fafc",
          border: "rgba(255, 255, 255, 0.08)",
        },
        popover: {
          DEFAULT: "#0f172a",
          foreground: "#f8fafc",
        },
        primary: {
          DEFAULT: "#38bdf8", // Sky / cyan accent
          foreground: "#030712",
          hover: "#0284c7",
        },
        secondary: {
          DEFAULT: "#1e293b",
          foreground: "#94a3b8",
        },
        muted: {
          DEFAULT: "#1e293b",
          foreground: "#64748b",
        },
        accent: {
          DEFAULT: "#2563eb",
          foreground: "#f8fafc",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#f8fafc",
        },
        border: "rgba(255, 255, 255, 0.1)",
        input: "rgba(255, 255, 255, 0.06)",
        ring: "#38bdf8",
        // Disaster severity status bands
        severity: {
          critical: "#ef4444", // Red (80-100)
          high: "#f97316",     // Orange (60-79.99)
          medium: "#eab308",   // Amber (35-59.99)
          low: "#10b981",      // Emerald (0-34.99)
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      boxShadow: {
        glow: "0 0 20px -5px rgba(56, 189, 248, 0.25)",
        "critical-glow": "0 0 20px -5px rgba(239, 68, 68, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
