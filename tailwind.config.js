/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        base:    "#212121",
        surface: "#1a1a1a",
        sidebar: "#171717",
        card:    "#1e1e1e",
        border:  "#2f2f2f",
        purple:  "#8b5cf6",
      },
    },
  },
  plugins: [],
};
