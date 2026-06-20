/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16232e",
        eucalypt: "#1f7a66",
        wattle: "#e0a32e",
        clay: "#c2492f",
      },
    },
  },
  plugins: [],
};
