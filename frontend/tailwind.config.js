/** @type {import('tailwindcss').Config} */
export default {
  // Preflight v3 dimatikan: reset dasar sudah dibawa design-system.css (Tailwind v4,
  // pakai native @layer). Preflight v3 yang unlayered akan menang cascade dan
  // merusak komponen design system (button/input reset).
  corePlugins: { preflight: false },
  content: ['./index.html','./src/**/*.{js,jsx}'],
  safelist: [
    // Dynamic classes using CSS vars used in components
    { pattern: /^(bg|text|border)-.+/ },
    'animate-spin', 'animate-pulse-slow', 'cursor-blink',
  ],
  theme: {
    extend: {
      fontFamily: { mono: ['"JetBrains Mono"','monospace'] },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn .2s ease-out',
        'slide-in':   'slideIn .2s ease-out',
        'spin':       'spin 1s linear infinite',
      },
      keyframes: {
        fadeIn:  { from:{ opacity:0 }, to:{ opacity:1 } },
        slideIn: { from:{ opacity:0, transform:'translateY(8px)' }, to:{ opacity:1, transform:'translateY(0)' } },
      }
    }
  },
  plugins: []
}
