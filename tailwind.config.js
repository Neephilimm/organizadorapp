/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#EDEFF2',
        ink: '#1B2430',
        crimson: '#C1272D',
        teal: '#3E7C7C',
        amber: '#D6A419'
      },
      fontFamily: {
        display: ['"Newsreader"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      }
    }
  },
  plugins: []
};
