/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#fef7ee",
          100: "#fdedd6",
          200: "#f9d7ac",
          300: "#f5ba77",
          400: "#f09240",
          500: "#ec741a",
          600: "#dd5a10",
          700: "#b74210",
          800: "#923515",
          900: "#762e14",
          950: "#401409",
        },
      },
    },
  },
  plugins: [],
};
