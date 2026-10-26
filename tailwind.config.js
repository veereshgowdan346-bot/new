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
          bg: '#0B1020',
          card: '#151F33',
          cardHover: '#1B2740',
          border: 'rgba(56, 80, 120, 0.28)',
          borderGlow: 'rgba(56, 217, 245, 0.4)',
          cyan: '#38D9F5',
          cyanGlow: '#5FE2F8',
          neonGreen: '#35D49A',
          neonRed: '#FF657A',
          neonAmber: '#F5B942',
          muted: '#6B7A99',
          textMuted: '#A8B4CA',
        },
        terminal: {
          bg: 'var(--bg-main)',
          bgSecondary: 'var(--bg-secondary)',
          card: 'var(--surface-card)',
          elevated: 'var(--surface-elevated)',
          overlay: 'var(--surface-overlay)',
          border: 'var(--border-subtle)',
          borderHighlight: 'var(--border-highlight)',
          cyan: 'var(--accent-cyan)',
          violet: 'var(--accent-violet)',
          positive: 'var(--color-positive)',
          negative: 'var(--color-negative)',
          warning: 'var(--color-warning)',
          text: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
        }
      },
      boxShadow: {
        'neon-cyan': '0 0 15px rgba(56, 217, 245, 0.35)',
        'neon-green': '0 0 15px rgba(53, 212, 154, 0.35)',
        'neon-red': '0 0 15px rgba(255, 101, 122, 0.35)',
        'cyber-card': 'var(--shadow-neumorph-card)',
        'neumorph-card': 'var(--shadow-neumorph-card)',
        'neumorph-elevated': 'var(--shadow-neumorph-elevated)',
        'neumorph-inset': 'var(--shadow-neumorph-inset)',
        'neumorph-button': 'var(--shadow-neumorph-button)',
        'glow-cyan': 'var(--shadow-glow-cyan)',
        'glow-positive': 'var(--shadow-glow-positive)',
        'glow-negative': 'var(--shadow-glow-negative)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

