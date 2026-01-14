/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{html,js}"],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#1e40af', // Professional blue
                secondary: '#1f2937', // Dark gray
                accent: '#f59e0b', // Gold accent for premium feel
                success: '#10b981', // Green for positive results
                danger: '#ef4444', // Red for warnings
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                serif: ['Georgia', 'serif'], // For elegant headings
            },
        },
    },
    plugins: [],
}