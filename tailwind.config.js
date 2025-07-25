/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        'cactus': {
          50: '#f0f9f1',
          100: '#dcf1e0',
          200: '#bce3c3',
          300: '#90cf9c',
          400: '#60b36e',
          500: '#3c964c',
          600: '#2c7a3c',
          700: '#266133',
          800: '#224d2c',
          900: '#1e4027',
          950: '#0e2516',
        },
        'sand': {
          50: '#f9f7f2',
          100: '#f2ece0',
          200: '#e5d8c3',
          300: '#d7c1a1',
          400: '#c9a87d',
          500: '#be9363',
          600: '#b07a50',
          700: '#936244',
          800: '#78503d',
          900: '#634235',
          950: '#352118',
        },
        'beige': {
          50: '#fcfbf7',
          100: '#f5f0e6',
          200: '#eadecb',
          300: '#ddc7a7',
          400: '#ccab7d',
          500: '#c0955e',
          600: '#b37f4d',
          700: '#956541',
          800: '#79523a',
          900: '#634533',
          950: '#36231a',
        },
      },
    },
  },
  plugins: [],
};