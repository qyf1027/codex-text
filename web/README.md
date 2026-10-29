# IPD Smart Tracker Web App

React、TypeScript、Vite。本地计算和保存，无需账号、网络或 Gemini 密钥。需要 Node.js 18+。

```sh
npm ci
npm run dev
```

打开 Vite 在终端输出的地址。当前云工作区的 `localhost` 不会自动映射到你电脑的浏览器；在自己电脑运行以上命令，或下载项目根目录的 `IPD-Smart-Tracker.html`。生成独立 HTML：

```sh
npm run build:standalone
```

验证：

```sh
npm test
npm run lint
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

浏览器测试需要 Chromium；也可让 Playwright 安装浏览器后运行。

## 使用和数据

首次启动自动创建 55 项任务的示例项目。左侧选择或创建项目，编辑阶段、任务、成果、依赖和 GA；首页显示标准预测与风险。资源预约只约束预约的工作日。方案先预览各 GA 影响，再确认采纳；候选不会自动修改实际记录。

工作区自动保存在当前浏览器（IndexedDB；不可用时使用 localStorage）。请定期导出完整工作区 JSON。恢复会替换当前工作区，界面要求确认；单项目导入可与现有数据并存。示例数据在 `../examples/ipd-default-workspace.json`。单项目导出用于分享单一项目；跨项目联合方案和完整历史应使用完整工作区备份。

计划开始日算第 1 个工作日，成果交付后的下一工作日才可计划启动依赖任务。工作日按周一至周五；实际日期允许周末，如实记录。法定节假日未纳入。压缩和错峰候选由本地约束算法生成，可能不是数学最优；硬截止违规会标记不可行。未确认的外部资源条件只能模拟，确认输入后重新校验才能采纳。

当前未连接 Gemini。离线规则建议可用；不会将项目数据发送到 AI。若以后接入外部 AI，需先明确用户同意发送的数据及密钥存放方式。浏览器本地数据不会自动跨设备同步；建议保留 JSON 备份。
