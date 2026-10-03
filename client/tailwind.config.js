/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        security: {
          verified: {
            bg: 'rgba(16, 185, 129, 0.1)',
            border: '#10b981',
            text: '#34d399',
          },
          flagged: {
            bg: 'rgba(245, 158, 11, 0.1)',
            border: '#f59e0b',
            text: '#fbbf24',
          },
          rejected: {
            bg: 'rgba(239, 68, 68, 0.1)',
            border: '#ef4444',
            text: '#f87171',
          },
          insufficient: {
            bg: 'rgba(148, 163, 184, 0.1)',
            border: '#94a3b8',
            text: '#cbd5e1',
          },
        },
      },
    },
  },
  plugins: [],
}
