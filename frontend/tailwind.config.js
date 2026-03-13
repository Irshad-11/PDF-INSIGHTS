/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        zinc: {
          950: '#0a0a0a',
          900: '#18181b',
          800: '#27272a',
        }
      }
    },
  },
  plugins: [],
}