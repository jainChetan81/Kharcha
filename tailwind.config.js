const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  corePlugins: {
    fontWeight: false,
  },
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#f0f0f0',
        card: { DEFAULT: '#1a1a1a', foreground: '#f0f0f0' },
        muted: { DEFAULT: '#2a2a2a', foreground: '#888888' },
        border: '#2a2a2a',
        input: '#2a2a2a',
        primary: { DEFAULT: '#7c3aed', foreground: '#ffffff' },
        // Lighter brand purple for FOREGROUND TEXT on dark surfaces. The fill
        // colour (#7c3aed) is only 3.05:1 on the card as text (fails WCAG AA);
        // this passes ≥4.5:1. Use `text-primary-text`, keep `bg-primary` for fills.
        'primary-text': '#a78bfa',
        secondary: { DEFAULT: '#1a1a1a', foreground: '#f0f0f0' },
        // Darkened so the white button label clears AA (white on #cf4e4e was
        // 4.33:1; on #c0392b it's ~5.4:1). Used only as a fill (bg-destructive).
        destructive: { DEFAULT: '#c0392b', foreground: '#ffffff' },
        accent: { DEFAULT: '#2a2a2a', foreground: '#f0f0f0' },
        popover: { DEFAULT: '#1a1a1a', foreground: '#f0f0f0' },
        positive: '#2ea262',
        negative: '#cf4e4e',
        // Lighter red for FOREGROUND TEXT (amounts, error copy) on dark — #cf4e4e
        // is 4.02:1 as text on the card; #e06464 clears AA. Keep `negative` as the
        // solid fill (bg-negative selected segments) where white text needs a darker base.
        'negative-text': '#e06464',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Geist_400Regular'],
        mono: ['GeistMono_400Regular'],
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ".font-normal": { fontFamily: "Geist_400Regular", fontWeight: "400" },
        ".font-medium": { fontFamily: "Geist_500Medium", fontWeight: "500" },
        ".font-semibold": { fontFamily: "Geist_600SemiBold", fontWeight: "600" },
        ".font-bold": { fontFamily: "Geist_700Bold", fontWeight: "700" },
        ".font-extrabold": { fontFamily: "Geist_800ExtraBold", fontWeight: "800" },
      });
    }),
  ],
}
