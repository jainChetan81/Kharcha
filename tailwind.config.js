/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
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
        destructive: { DEFAULT: '#ef4444', foreground: '#ffffff' },
        accent: { DEFAULT: '#2a2a2a', foreground: '#f0f0f0' },
        popover: { DEFAULT: '#1a1a1a', foreground: '#f0f0f0' },
        positive: '#22c55e',
        negative: '#ef4444',
      },
    },
  },
  plugins: [],
}
