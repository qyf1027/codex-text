"""Verify the vendored snapshots without network access or extra dependencies."""
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
lock = json.loads((root / 'skills-lock.json').read_text())
errors = []
expected_dirs = {entry['directory'] for entry in lock['skills']}
skills_dir = root / '.agents/skills'
if {p.name for p in skills_dir.iterdir()} != expected_dirs:
    errors.append('Unexpected or missing skill directory')
for entry in lock['skills']:
    folder = skills_dir / entry['directory']
    if not re.fullmatch(r'[0-9a-f]{40}', entry['commit']):
        errors.append(f"Invalid upstream commit: {entry['directory']}")
    actual = {}
    for path in folder.rglob('*'):
        if path.is_symlink():
            errors.append(f'Symlink is not allowed: {path.relative_to(root)}')
        elif path.is_file():
            actual[str(path.relative_to(folder))] = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != entry['files']:
        errors.append(f"Snapshot mismatch: {entry['directory']}")
    skill = folder / 'SKILL.md'
    if not skill.is_file():
        errors.append(f'Missing {skill}')
        continue
    content = skill.read_text()
    frontmatter = content.split('---', 2)
    if len(frontmatter) != 3 or frontmatter[0].strip():
        errors.append(f'Invalid frontmatter: {skill}')
    else:
        for field in ('name', 'description'):
            if not re.search(rf'^{field}:\s*\S', frontmatter[1], re.MULTILINE):
                errors.append(f'Missing {field}: {skill}')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f"Verified {len(lock['skills'])} skill snapshots, "
      f"{sum(len(e['files']) for e in lock['skills'])} file hashes and required metadata.")
