const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Revert the background
content = content.replace(
    /className="relative overflow-hidden rounded-3xl border border-white\/10\s*bg-transparent p-5 sm:p-7 lg:col-span-5 lg:p-10"/,
    'className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0e1a16] via-[#0a1210] to-[#0c1412] p-5 sm:p-7 lg:col-span-5 lg:p-10"'
);

// 2. Remove the watermark
const watermarkRegex = /\s*\{\/\* Fast Ekub Watermark \*\/\}\s*<div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden">\s*<span className="text-\[120px\] font-black text-white\/\[0\.04\] rotate-\[-15deg\] whitespace-nowrap tracking-widest leading-none">FAST EKUB<\/span>\s*<\/div>/;

content = content.replace(watermarkRegex, '');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Landing page restored');
