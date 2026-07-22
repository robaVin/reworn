import type { Config } from 'tailwindcss';

/**
 * Design system foundation — "Sustainable" direction (Design 03).
 *
 * Tokens are derived from the approved design prototype
 * (design/preview.html, THEMES.sustainable) and are the single source of
 * truth for colour. Components must consume these tokens, never raw hex.
 *
 * ACCESSIBILITY ADJUSTMENTS (approved deviation — WCAG 2.1 AA, 1.4.3):
 * The prototype palette fails AA contrast in three places. Adjusted values
 * keep the warm Sustainable character but reach ≥4.5:1 for normal text:
 *
 *   muted        #8A7F6F → #6B5F51  (3.4:1 → 5.4:1 on cream, 4.9:1 on sand)
 *                The original value remains as `muted-soft` for large
 *                display text and decorative use ONLY (≥24px / 18.66px bold).
 *   terracotta   #C06B4E stays for DECORATIVE use (borders, icons, large
 *                display text, gradients, focus ring — non-text 3:1 ✓).
 *                `terracotta-strong` #9C4A2F is the variant for small text
 *                on cream/surface (5.3:1) and for filled controls carrying
 *                cream/white text (5.3:1 / 6.1:1).
 *   warning      #B26B00 → #8F5600  (3.7:1 → 5.2:1 on cream).
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
          DEFAULT: '#C06B4E', // decorative accent: borders, icons, large text
          strong: '#9C4A2F', // small text + filled controls (AA compliant)
          hover: '#833E27', // hover for strong fills
        },
        forest: {
          DEFAULT: '#2F4A3C', // secondary / success
          hover: '#243A2F',
        },
        olive: '#7C7A4F',
        // Text
        ink: '#3A342E', // primary text
        muted: '#6B5F51', // secondary text (AA on cream/surface/sand)
        'muted-soft': '#8A7F6F', // large display text / decorative ONLY
        // Lines
        line: '#E0D3C0',
        // Feedback
        danger: '#B3261E',
        warning: '#8F5600',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // Sustainable direction: generous, rounded.
        card: '18px',
        control: '999px',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(58, 52, 46, 0.08)',
        lift: '0 18px 50px rgba(58, 52, 46, 0.12)',
      },
      maxWidth: {
        shell: '85rem', // 1360px — prototype content width
      },
      aspectRatio: {
        listing: '3 / 4', // prototype listing imagery
      },
    },
  },
  plugins: [],
};

export default config;
