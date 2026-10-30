import type { Config } from "tailwindcss";

// Sampled from the supplied ivory / pearl / slate-blue / navy / chocolate swatch.
const atlasBlue = {
  50: "#eef1f3", 100: "#dce3e9", 200: "#bccbd7", 300: "#9eafc1",
  400: "#8b9fb5", 500: "#798da6", 600: "#4c6680", 700: "#304b66",
  800: "#243c55", 900: "#142841", 950: "#0e1d30",
};
const parchment = {
  50: "#fffbf1", 100: "#f5edde", 200: "#e7d6c2", 300: "#cbb79e",
  400: "#9c846c", 500: "#6d5947", 600: "#64513f", 700: "#4f3c30",
  800: "#392e28", 900: "#142841", 950: "#0e1d30",
};

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
        background: "#f2e8d9",
        foreground: "#142841",
        white: "#fff9ed",
        slate: parchment,
        blue: atlasBlue,
        sky: atlasBlue,
        indigo: atlasBlue,
        purple: atlasBlue,
        brand: {
          ivory: "#fffce9",
          pearl: "#e7d6c2",
          blue: "#798da6",
          navy: "#142841",
          chocolate: "#674635",
        },
        card: {
          DEFAULT: "#fff9ed",
          foreground: "#142841",
          border: "#cbb79e",
        },
        popover: {
          DEFAULT: "#fff9ed",
          foreground: "#142841",
        },
        primary: {
          DEFAULT: "#674635",
          foreground: "#fffce9",
          hover: "#503627",
        },
        secondary: {
          DEFAULT: "#e7d6c2",
          foreground: "#4f3c30",
        },
        muted: {
          DEFAULT: "#f5edde",
          foreground: "#6d5947",
        },
        accent: {
          DEFAULT: "#798da6",
          foreground: "#142841",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#142841",
        },
        border: "#cbb79e",
        input: "#fffbf1",
        ring: "#4c6680",
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
        glow: "0 1px 3px rgba(103, 70, 53, 0.10)",
        "critical-glow": "0 1px 3px rgba(103, 70, 53, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
