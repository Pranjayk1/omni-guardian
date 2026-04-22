/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Barlow Condensed', 'sans-serif'],
        body:    ['Barlow', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg:      '#060c12',
        surface: '#0d1822',
        card:    '#111f2e',
        border:  '#1a2d42',
        muted:   '#2a4057',
        dim:     '#4a6a85',
        // accents
        cyan:    '#00d4ff',
        cyanDim: '#0a4a5e',
        green:   '#00e676',
        yellow:  '#ffd600',
        orange:  '#ff9500',
        red:     '#ff4444',
        // text
        hi:      '#e8f4fc',
        mid:     '#7fa8c4',
        lo:      '#3d6480',
      },
      keyframes: {
        pulse2: {
          '0%,100%': { opacity: 1 },
          '50%':     { opacity: 0.4 },
        },
        scanline: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        slideIn: {
          '0%':   { transform: 'translateX(-16px)', opacity: 0 },
          '100%': { transform: 'translateX(0)',     opacity: 1 },
        },
      },
      animation: {
        pulse2:   'pulse2 2s ease-in-out infinite',
        scanline: 'scanline 8s linear infinite',
        slideIn:  'slideIn 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
