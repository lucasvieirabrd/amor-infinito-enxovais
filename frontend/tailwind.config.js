/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    fontFamily: {
      inter: ['Inter', 'sans-serif'],
      sans: ['Inter', 'sans-serif'],
    },
    extend: {
      colors: {
        primary: '#6C63FF',
        secondary: '#FF6584',
        success: '#48BB78',
        error: '#FC8181',
        background: '#F8F9FA',
        white: '#FFFFFF',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      fontWeight: {
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-in-out',
        spin: 'spin 1s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      borderRadius: {
        card: '16px',
        lg: '0.5rem',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,0.08)',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      spacing: {
        sidebar: '240px',
        header: '64px',
      },
      opacity: {
        10: '0.1',
        20: '0.2',
        50: '0.5',
        70: '0.7',
        90: '0.9',
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
  ],
}
