import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const assets = readdirSync(join(dist, 'assets'));
const javascript = readFileSync(join(dist, 'assets', assets.find(name => name.endsWith('.js'))), 'utf8').replaceAll('</script', String.raw`<\x2fscript`);
const stylesheet = readFileSync(join(dist, 'assets', assets.find(name => name.endsWith('.css'))), 'utf8').replaceAll('</style', String.raw`<\x2fstyle`);
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, () => `<script type="module">${javascript}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => `<style>${stylesheet}</style>`);
if ((html.match(/<\/script>/g) || []).length !== 1 || !html.includes('<style>')) throw new Error('独立 HTML 打包结果无效');
const output = resolve('..', 'IPD-Smart-Tracker.html');
writeFileSync(output, html);
console.log(`独立 HTML 已生成：${output}`);
