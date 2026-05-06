/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{html,js,md}", "./dist/**/*.html"],
    safelist: [
        'content-columns',
        'content-column',
        'content-callout',
        'content-callout-info',
        'content-callout-success',
        'content-callout-warning',
        'content-callout-error',
        'content-callout-accent',
        'content-callout-primary',
        'content-callout-inline',
        'content-table',
        'content-table-container',
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
        'gap-2',
        'gap-4',
        'gap-6',
        'rounded-sm',
        'border-l-4',
        'text-2xl',
        'flex-shrink-0',
        'mr-4',
        'person-photo',
        'w-[120px]',
        'h-[120px]',
        'w-[300px]',
        'h-[300px]',
        'rounded-full',
        'object-cover',
        'shadow-lg',
        'mx-auto',
        'block',
        '!rounded-full',
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
                serif: ['Newsreader', 'Georgia', 'serif'], // Editorial serif
            },
            backgroundImage: {
                'hero-pattern': "radial-gradient(#0f172a08 1px, transparent 1px)", // Updated to match primary color
            },
            boxShadow: {
                'ambient-xs': '0 8px 20px rgba(21, 28, 39, 0.08)',
                'ambient-sm': '0 10px 26px rgba(21, 28, 39, 0.05)',
                'ambient-md': '0 12px 30px rgba(21, 28, 39, 0.06)',
                'ambient-lg': '0 16px 36px rgba(21, 28, 39, 0.06)',
                'ambient-lg-hover': '0 20px 44px rgba(21, 28, 39, 0.08)',
                'ambient-xl': '0 20px 40px rgba(21, 28, 39, 0.08)',
                'ambient-xl-hover': '0 24px 48px rgba(21, 28, 39, 0.10)',
                'ambient-2xl': '0 24px 48px rgba(21, 28, 39, 0.12)',
                'ambient-card-hover': '0 20px 42px rgba(21, 28, 39, 0.08)',
            },
        },
    },
    plugins: [],
}