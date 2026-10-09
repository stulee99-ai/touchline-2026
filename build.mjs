// Bundles the game into a single self-contained HTML page.
//   node build.mjs          -> dist/index.html (open in any browser) + dist/touchline.html (artifact body)
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/ui/app.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/ui/styles.css', 'utf8');

const body = `<title>Touchline 2026</title>
<style>
${css}
</style>
<div id="app"></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script>
${js}
</script>
`;

// Add to Home Screen: the game opens full screen, without the browser's bars (iPhone and Android).
const HOME_SCREEN = [
  '<meta name="theme-color" content="#0b1733">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
  '<meta name="apple-mobile-web-app-title" content="Touchline">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/svg+xml" href="icon.svg">',
  '<link rel="apple-touch-icon" href="icon-180.png">',
].join('\n');

mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
writeFileSync('dist/touchline.html', body);
writeFileSync(
  'dist/index.html',
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${HOME_SCREEN}\n</head>\n<body>\n${body}</body>\n</html>\n`,
);
console.log(`built dist/index.html (${(body.length / 1024).toFixed(0)} KB)`);
