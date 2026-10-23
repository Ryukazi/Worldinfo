// Copies the static site into dist/ (no bundler needed, works in Termux).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'src'), path.join(out, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
console.log('Built dist/');
