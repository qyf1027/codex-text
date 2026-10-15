# codex-text

一个整洁、可追溯的 Codex 仓库级 Skill 集合。当前收录十一项：

| 目录 | 用途 | 上游 |
| --- | --- | --- |
| `frontend-app-builder` | 新前端应用、页面及改版 | OpenAI plugins |
| `playwright-cli` | 浏览器交互与功能验证 | Microsoft playwright-cli |
| `web-design-guidelines` | 可访问性、UI/UX 审查 | Vercel agent-skills |
| `react-best-practices` | React / Next.js 性能与代码质量 | Vercel agent-skills |

| `composition-patterns` | React 组件组合、接口与状态组织 | Vercel agent-skills |
| `frontend-testing-debugging` | 前端问题定位与渲染验证流程 | OpenAI plugins |
| `shadcn-best-practices` | shadcn/ui 组件、表单与主题开发 | OpenAI plugins |

| `react-native-skills` | React Native / Expo 性能与移动端模式 | Vercel agent-skills |
| `building-native-ui` | Expo 原生界面、导航与存储 | Expo / OpenAI plugins |
| `native-data-fetching` | 移动端请求、重试、缓存与鉴权 | Expo / OpenAI plugins |
| `supabase-postgres-best-practices` | Postgres 表设计、查询与数据隔离 | Supabase / OpenAI plugins |

已在账号安装的 Superpowers 和 Frontend Design 不重复存放。

## 使用

让 Codex 在此仓库中工作，使用这些名称请求对应任务。支持仓库级 Skill
发现的运行时会扫描 `.agents/skills/`；若未自动列出，根目录 `AGENTS.md`
指示代理直接读取相关 `SKILL.md`。新增 Skill 后建议开启新任务。
当前会话已验证文件及 Playwright 工具，尚未验证新任务中的自动发现。
这不是账号级插件安装，也不包含完整 Build Web Apps 插件的其他功能。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

需要 Node.js 18+、npm、Python 3。浏览器操作见 [使用说明](docs/usage.md)。

## 目录

- `.agents/skills/`：原样保存的上游 Skill 和配套资源。
- `skills-lock.json`：上游提交、来源路径及每个文件的 SHA-256。
- `scripts/`：完整性校验和浏览器本地配置工具。
- `docs/`：使用、限制和升级说明。
- `third_party/`：第三方许可与来源说明。
- `package.json` / `package-lock.json`：固定的 Playwright CLI 依赖。

升级不会自动追踪 main；见 [维护说明](docs/maintenance.md)。不要提交缓存、
截图、浏览器登录态、密钥或 node_modules。

## 产品需求资料

[时间规划与专注 App 初步需求](docs/product/time-management/requirements-draft.md)：
Android + Windows、联网同步、托管云服务。当前为讨论稿，未开始产品实现。
