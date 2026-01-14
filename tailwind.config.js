/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{html,js}"],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#0f172a', // Deep Navy (Classic Premium)
                secondary: '#334155', // Slate
                accent: '#b45309', // Elegant Gold
                success: '#059669', // Emerald
                danger: '#dc2626', // Red
                surface: '#f8fafc', // Very light slate for backgrounds
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                serif: ['"Playfair Display"', 'Georgia', 'serif'], // Premium serif
            },
            backgroundImage: {
                'hero-pattern': "radial-gradient(#0f172a08 1px, transparent 1px)", // Updated to match primary color
            }
        },
    },
    plugins: [],
}