/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          400: '#1D9E75',
          500: '#1D9E75',
          600: '#0F6E56',
          700: '#085041',
          800: '#085041',
        },
      },
    },
  },
  plugins: [],
};
