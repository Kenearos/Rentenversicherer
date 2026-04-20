/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../kanagawa-design-system/tailwind/kanagawa.preset.js')],
  content: [
    './index.html',
    './**/*.{js,ts,jsx,tsx}',
    '!./node_modules/**',
    '!./dist/**',
    '!./test-fixtures/**',
  ],
  plugins: [],
};
