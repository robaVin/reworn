import type { Config } from 'tailwindcss';

/**
 * Design system foundation — "warm & simple" direction.
 *
 * Tokens are derived from the approved design prototype
 * (design/preview.html, "Earthy Sustainable" art direction) and are the single
 * source of truth for colour. Components must consume these tokens, never
 * raw hex values.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        cream: '#F4EFE6', // page background
        surface: '#FBF8F2', // cards / raised surfaces
        sand: '#EDE4D6', // secondary surface
        // Brand
        terracotta: {
          DEFAULT: '#C06B4E', // primary action
          hover: '#A85940',
        },
        forest: {
          DEFAULT: '#2F4A3C', // secondary / success
          hover: '#243A2F',
        },
        olive: '#7C7A4F',
        // Text
        ink: '#3A342E', // primary text
        muted: '#8A7F6F', // secondary text
        // Lines
        line: '#E0D3C0',
        // Feedback
        danger: '#B3261E',
        warning: '#B26B00',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // Warm/simple direction: generous, rounded.
        card: '18px',
        control: '999px',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(58, 52, 46, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
