/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f2e9',
        paperDeep: '#efe6d4',
        ink: '#332e28',
        inkSoft: '#6f6457',
        accent: '#b0713a',
        accentDeep: '#8f5a2c',
        hi: '#f3d9a6',
        line: '#e3d8c2',
      },
    },
  },
  plugins: [],
};
