import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('..');
let html = readFileSync(resolve(root, 'docs/IPD-使用说明书.source.html'), 'utf8');
const images = ['01-overview','02-tasks','03-outcome','04-gate','05-dependency','06-resources','07-backup'];
for (const name of images) {
  const base64 = readFileSync(resolve(root, 'docs/manual-assets', `${name}.png`)).toString('base64');
  html = html.replaceAll(`{{IMG_${name}}}`, `data:image/png;base64,${base64}`);
}
if (html.includes('{{IMG_')) throw new Error('截图未完整嵌入');
const output = resolve(root, 'IPD-图解使用说明书.html');
writeFileSync(output, html);
console.log(output);
