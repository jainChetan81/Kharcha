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
        secondary: { DEFAULT: '#1a1a1a', foreground: '#f0f0f0' },
        destructive: { DEFAULT: '#cf4e4e', foreground: '#ffffff' },
        accent: { DEFAULT: '#2a2a2a', foreground: '#f0f0f0' },
        popover: { DEFAULT: '#1a1a1a', foreground: '#f0f0f0' },
        positive: '#2ea262',
        negative: '#cf4e4e',
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
