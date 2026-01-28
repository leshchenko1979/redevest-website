/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{html,js}", "./dist/**/*.html"],
    safelist: [
        'notion-columns',
        'notion-column',
        'notion-callout',
        'notion-callout-info',
        'notion-callout-success',
        'notion-callout-warning',
        'notion-callout-error',
        'border-blue-500',
        'bg-blue-50',
        'border-green-500',
        'bg-green-50',
        'border-yellow-500',
        'bg-yellow-50',
        'border-red-500',
        'bg-red-50',
        'p-6',
        'p-2',
        'px-2',
        'px-6',
        'my-6',
        'flex',
        'items-start',
        'text-sm',
        'border-gray-300',
        'border-gray-400',
        'border-gray-500',
        'bg-gray-100',
        'border-2',
        'shadow-sm',
        'notion-table',
        'gap-2',
        'gap-4',
        'gap-6',
        'rounded-sm',
        'border-l-4',
        'text-2xl',
        'flex-shrink-0',
        'mr-4',
    ],
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