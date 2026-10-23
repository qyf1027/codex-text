from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text()
css = (root / 'style.css').read_text()
core = (root / 'core.mjs').read_text().replace('export function ', 'function ')
app = (root / 'app.mjs').read_text()
app = app.replace("import { makeProject, schedule, optimize, validateImport } from './core.mjs';", '')
app = app.replace("seed = await fetch('./seed.json').then(r => r.json());", "seed = JSON.parse(document.getElementById('seed-data').textContent);")
seed = (root / 'seed.json').read_text().replace('</', '<\\/')
html = html.replace('<link rel="stylesheet" href="style.css" />', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="app.mjs"></script>', f'<script id="seed-data" type="application/json">{seed}</script>\n<script>\n{core}\n{app}\n</script>')
(root / 'preview.html').write_text(html)
