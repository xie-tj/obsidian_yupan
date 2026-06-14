/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#05070d',
          900: '#0a0e17',
          800: '#101725',
          700: '#1a2336',
        },
        neon: {
          cyan: '#22e6ff',
          red: '#ff3b4d',
          orange: '#ff7849',
          green: '#2dffb3',
          gold: '#ffd166',
          violet: '#9d6bff',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', '"Courier New"', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 18px rgba(34,230,255,.35), 0 0 60px rgba(34,230,255,.12)',
        'neon-red': '0 0 18px rgba(255,59,77,.45), 0 0 60px rgba(255,59,77,.16)',
        'neon-green': '0 0 18px rgba(45,255,179,.40), 0 0 60px rgba(45,255,179,.14)',
      },
    },
  },
  plugins: [],
}
