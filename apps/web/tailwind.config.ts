import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f1ff",
          100: "#e6e4ff",
          200: "#cbc6ff",
          300: "#a89dff",
          400: "#8570ff",
          500: "#6d4bff",
          600: "#5a2fee",
          700: "#4a22c9",
          800: "#3c1da2",
          900: "#331c82",
          950: "#1f1052",
        },
        accent: {
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
        },
        canvas: {
          DEFAULT: "#f6f5fb",
          dark: "#0b0b16",
        },
        surface: {
          DEFAULT: "#ffffff",
          dark: "#14141f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 20px 45px -20px rgba(31, 16, 82, 0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
