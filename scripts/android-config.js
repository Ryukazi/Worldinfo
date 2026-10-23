// Writes capacitor.config.json. The APK loads your deployed Vercel site (same app, same design).
const url = process.env.SITE_URL;
if (!/^https:\/\//.test(url || '')) { console.error('SITE_URL must be an https URL'); process.exit(1); }
require('fs').writeFileSync('capacitor.config.json', JSON.stringify({
  appId: 'com.lorddenish.worldscope', appName: 'WorldScope', webDir: 'dist',
  server: { url, cleartext: false }, backgroundColor: '#020817'
}, null, 2));
