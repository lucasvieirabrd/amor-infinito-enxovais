/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
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
      },
      fontWeight: {
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,0.08)',
      },
      spacing: {
        sidebar: '240px',
        header: '64px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
