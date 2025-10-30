import type { Config } from 'tailwindcss';
import withMT from '@material-tailwind/react/utils/withMT';

export default withMT({
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f5ff',
          100: '#dbe7ff',
          200: '#b4ceff',
          300: '#8bb5ff',
          400: '#5a96ff',
          500: '#2d78ff',
          600: '#1a5be6',
          700: '#1345b4',
          800: '#0c2f82',
          900: '#061c52'
        }
      }
    }
  },
  plugins: []
}) satisfies Config;
