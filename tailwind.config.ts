import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#1E1E1E",
        foreground: "#FFFFFF",
        primary: "#1E40AF", // Dark blue for AoE2 Theme
      },
    },
  },
  plugins: [],
};

export default config;
