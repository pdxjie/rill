/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'rgb(var(--bg) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        panel2: 'rgb(var(--panel2) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        linestrong: 'rgb(var(--line-strong) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        accent2: 'rgb(var(--accent2) / <alpha-value>)',
        green: 'rgb(var(--green) / <alpha-value>)',
        red: 'rgb(var(--red) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        blue: 'rgb(var(--blue) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
        pink: 'rgb(var(--pink) / <alpha-value>)',
        cyan: 'rgb(var(--cyan) / <alpha-value>)',
        teal: 'rgb(var(--teal) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          '"PingFang SC"',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          '"SF Mono"',
          '"JetBrains Mono"',
          'Menlo',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['11.5px', '15px'],
        xs: ['12px', '17px'],
        sm: ['13px', '18px'],
        base: ['13.5px', '20px'],
        md: ['14.5px', '21px'],
        lg: ['16px', '23px'],
        xl: ['19px', '26px'],
        '2xl': ['24px', '30px'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        pop: '0 16px 50px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 6px 20px -10px rgba(0,0,0,0.45)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.45', transform: 'scale(.82)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'pop-in': 'pop-in .22s cubic-bezier(.2,.9,.25,1)',
        'slide-up': 'slide-up .25s cubic-bezier(.2,.9,.25,1)',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
