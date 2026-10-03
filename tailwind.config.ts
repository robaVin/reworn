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
 *   terracotta   #CE0037 is the primary brand colour (borders, icons, large
 *                display text, gradients, focus ring, and filled controls). It
 *                is AA for small text on cream/surface/sand (4.98 / 5.38 /
 *                4.53:1) and for cream/white text on the fill (4.98 / 5.71:1).
 *                `terracotta-strong` is the same #CE0037 (the AA text/fill
 *                tone); `terracotta-hover` #A80030 darkens it for hover/pressed.
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
          DEFAULT: '#CE0037', // primary brand/accent: borders, icons, large text, fills
          strong: '#CE0037', // small text + filled controls (AA: 4.98:1 on cream)
          hover: '#A80030', // hover/pressed for filled controls
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
