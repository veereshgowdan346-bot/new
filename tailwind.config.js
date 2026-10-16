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
        cyber: {
          bg: '#060b17',
          card: '#0b1325',
          cardHover: '#0f1b35',
          border: 'rgba(30, 58, 110, 0.45)',
          borderGlow: 'rgba(0, 240, 255, 0.4)',
          cyan: '#00f0ff',
          cyanGlow: '#00d2ff',
          neonGreen: '#00e676',
          neonRed: '#ff3366',
          neonAmber: '#f59e0b',
          muted: '#64748b',
          textMuted: '#94a3b8',
        }
      },
      boxShadow: {
        'neon-cyan': '0 0 15px rgba(0, 240, 255, 0.35)',
        'neon-green': '0 0 15px rgba(0, 230, 118, 0.35)',
        'neon-red': '0 0 15px rgba(255, 51, 102, 0.35)',
        'cyber-card': '0 4px 20px -2px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

