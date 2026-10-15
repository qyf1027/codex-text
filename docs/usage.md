# 使用与运行条件

## Skill

- Frontend App Builder 的完整流程需要图像生成、图像查看及浏览器能力。
  它引用已安装的 imagegen skill；当前仅安装该 Skill 文件并不能提供该能力。
  本仓库保留上游原文；缺少能力时代理必须说明限制。未做完整前端产品生成验收。
- Playwright CLI 文件已完整收录；使用 `npm run browser -- <命令>`，
  等价于上游的 `playwright-cli <命令>`，不需要全局安装。
- Web Design Guidelines 每次审查会从
  `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
  获取最新规则。没有 WebFetch 时可使用保持 TLS 校验的 `curl -fsSL`。
  该规则内容会随上游变化，不在此仓库锁定范围内。
- React Best Practices 包含全部 rules 和汇总文档；其 frontmatter 名称是
  `vercel-react-best-practices`，目录名称沿用上游 `react-best-practices`。

## 浏览器

```sh
npm ci --ignore-scripts --no-audit --no-fund
python3 scripts/configure-browser.py
npm run browser -- open about:blank
npm run browser -- snapshot
npm run browser -- close
```

配置脚本优先选择 PATH 中已安装的 Chromium / Chrome，生成被 Git 忽略的
`.playwright/cli.config.json`，使用无头浏览器，并将输出放到 `output/`。
若没有浏览器，脚本会停止并说明；可用 `npx --no-install playwright install chromium`
安装官方浏览器，再运行配置脚本。系统库缺失时需另行安装系统依赖。
脚本不会覆盖现有本地配置，也不会关闭 TLS 或浏览器安全检查。

受限云环境若默认 npm 缓存不可写，可给 npm 命令追加
`--cache /tmp/codex-npm-cache`。若默认 Playwright 缓存不可写，在命令前设置
`XDG_CACHE_HOME=/tmp/codex-cache`。这些是本地运行路径，不含凭据。

本次在系统 Chromium 中验证：CLI 打开页面，设置测试按钮，读取快照引用，
通过 click 激活按钮，并读取到预期的 passed 状态，然后关闭测试会话。
这证明当前浏览器交互可用，不代表任意外部网站或账号登录态可用。
