import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f14',
        card: '#151b23',
        edge: '#232c37',
        accent: '#34d399',
        accent2: '#60a5fa',
        warn: '#fbbf24',
      },
    },
  },
  plugins: [],
};
export default config;
