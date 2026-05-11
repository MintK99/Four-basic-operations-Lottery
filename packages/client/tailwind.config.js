/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        lottery: {
          gold: '#F5A623',
          red: '#E74C3C',
          blue: '#3498DB',
          green: '#2ECC71',
          dark: '#1A1A2E',
          card: '#16213E',
          panel: '#0F3460',
        },
      },
      animation: {
        'dice-roll': 'spin 0.5s ease-out',
        'buzz-pulse': 'pulse 0.5s ease-in-out 3',
        'card-flip': 'flip 0.3s ease-in-out',
      },
      keyframes: {
        flip: {
          '0%': { transform: 'rotateY(0deg)' },
          '50%': { transform: 'rotateY(90deg)' },
          '100%': { transform: 'rotateY(0deg)' },
        },
      },
    },
  },
  plugins: [],
};
