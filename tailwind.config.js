/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/client/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        sf: {
          blue: '#0176D3',
          navy: '#014486',
          'navy-deep': '#032D60',
          sky: '#00A1E0',
          orange: '#FE9339',
          'orange-dark': '#C86B1A',
          success: '#2E844A',
          error: '#BA0517',
        },
        panel: {
          bg: '#111827',
          main: '#0d1117',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
