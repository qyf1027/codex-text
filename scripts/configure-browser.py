"""Create local Playwright CLI configuration; preserve existing user configuration."""
import json
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parents[1]
config = root / '.playwright/cli.config.json'
if config.exists():
    print(f'Existing configuration preserved: {config}')
    sys.exit(0)
executable = next((p for name in ('chromium', 'chromium-browser', 'google-chrome')
                   if (p := shutil.which(name))), None)
launch = {'headless': True}
if executable:
    launch['executablePath'] = executable
else:
    # The npm package provides the exact expected bundled Chromium path.
    import subprocess
    result = subprocess.run(
        ['node', '-e', 'console.log(require("playwright").chromium.executablePath())'],
        cwd=root, text=True, capture_output=True, check=True)
    if not Path(result.stdout.strip()).is_file():
        sys.exit('No Chromium found. Install with: npx --no-install playwright install chromium')
    launch['channel'] = 'chromium'
config.parent.mkdir(exist_ok=True)
with config.open('x') as stream:
    json.dump({'browser': {'browserName': 'chromium', 'launchOptions': launch},
               'outputDir': str(root / 'output/playwright')}, stream, indent=2)
    stream.write('\n')
print(f'Created {config}')
