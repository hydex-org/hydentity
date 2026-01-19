/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Hydex brand colors
        'hx': {
          green: '#97f01d',
          blue: '#00A8FF',
          purple: '#9945FF',
          bg: '#0E1114',
          text: '#C8D0D4',
          white: '#F2F5F7',
          'card-bg': '#151A1E',
        },
        // Extended palette based on brand
        'hyde': {
          50: '#f4fee6',
          100: '#e6fdc4',
          200: '#cefb8f',
          300: '#aef64f',
          400: '#97f01d',
          500: '#78d406',
          600: '#5ba903',
          700: '#468007',
          800: '#3a650c',
          900: '#32550f',
          950: '#173002',
        },
        'vault': {
          dark: '#0E1114',
          darker: '#090B0D',
          card: '#151A1E',
          border: '#1E2428',
          accent: '#252C32',
          hover: '#2A3238',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hyde-gradient': 'linear-gradient(135deg, #97f01d 0%, #00A8FF 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(151, 240, 29, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(151, 240, 29, 0.5)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
