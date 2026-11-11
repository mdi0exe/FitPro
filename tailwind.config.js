/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        vazir: ["Vazirmatn", "Tahoma", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#020617",
          900: "#0b1120",
          850: "#111827",
          800: "#1e293b",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(52, 211, 153, 0.25), 0 12px 40px -12px rgba(16, 185, 129, 0.45)",
        card: "0 18px 40px -28px rgba(0, 0, 0, 0.9)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(52, 211, 153, 0.5)" },
          "70%": { boxShadow: "0 0 0 14px rgba(52, 211, 153, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(52, 211, 153, 0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        "pop-in": "pop-in 0.2s ease-out both",
        "pulse-ring": "pulse-ring 2s infinite",
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};
