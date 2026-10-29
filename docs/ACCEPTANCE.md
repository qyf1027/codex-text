# PRD AT-01～38 验收记录（2026-10-29）

结果：61 项领域测试、TypeScript 检查、生产构建、Playwright 浏览器流程通过。下表列出逐项证据；浏览器流程覆盖操作入口和持久化，领域测试覆盖计算边界。测试环境为 Node.js、Vite 与 Chromium。

| 案例 | 结果 | 自动化证据 |
|---|---|---|
| AT-01～02 | 通过 | `calendar.test.ts` 工作日含首日和周五后继；`engine.test.ts` |
| AT-03 | 通过 | `engine.test.ts` 拒绝最短超过标准 |
| AT-04～07 | 通过 | `engine.test.ts` 跨项目传播、独立成果、AND 依赖及环路；改名不破坏 UUID |
| AT-08～10 | 通过 | `engine.test.ts` 必需/普通成果与完成条件；`browser-smoke.mjs` 完成对话框 |
| AT-11～13 | 通过 | `actions.test.ts` 普通版本更新、下游影响；`engine.test.ts` 固定版本引用；`browser-smoke.mjs` 失效流程 |
| AT-14 | 通过 | `engine.test.ts` 保留实际开始与依赖风险 |
| AT-15～17 | 通过 | `optimization.test.ts` 工期和成果独立最短、无最早偏移不提前、原始 GA 延期保留 |
| AT-18～19 | 通过 | `plan.test.ts` 原子采纳与历史；`engine.test.ts` 已采纳计划冲突 |
| AT-20～23 | 通过 | `engine.test.ts` 独占预约占用日；`resource-alternatives.test.ts` 顺序与 GA 比较；`plan.test.ts` 原子性；`browser-smoke.mjs` 资源方案 |
| AT-24～26 | 通过 | `optimization.test.ts`、`plan.test.ts` 硬截止；`resource-remedy.test.ts` 确认条件后模拟及采纳 |
| AT-27～28 | 通过 | `import-export.test.ts` 缺失外部源；`backup.test.ts` 完整往返；`browser-smoke.mjs` 下载备份 |
| AT-29～30 | 通过 | `storage.test.ts` 本地回退；`browser-smoke.mjs` 刷新保留；人工 Chromium 离线编辑及重载，AI 未配置提示 |
| AT-31～32 | 通过 | `engine.test.ts` UUID 改名、周日实际开始 |
| AT-33～34 | 通过 | `risk.test.ts` 去重与首发时间；`backup.test.ts` 损坏及版本拒绝 |
| AT-35～36 | 通过 | `baseline.test.ts`、`engine.test.ts` 实际完成和剩余工期 |
| AT-37～38 | 通过 | `actions.test.ts` 转移 ID 与环路；`engine.test.ts` 已完成任务下普通成果取消的跨项目风险 |

补充验证：`performance.test.ts` 使用 10 个项目、每项目 100 项任务和 3 项成果。独立 HTML 在本地 HTTP 打开时无运行错误且只请求一个文件。`file://` 在此云浏览器被管理员策略拦截，未直接验证双击打开。候选是启发式计算，不保证全局最优；法定节假日未建模。

## 模拟用户操作补充（2026-10-29）

新增 `web/scripts/user-journey.mjs`，在 Chromium 页面中操作：新建两个项目、切换项目新增任务、阶段/成果/GA、生成候选、修改约束、资源预约、损坏备份拒绝、完整备份恢复、全新浏览器恢复、单项目导出导入、旧版 JSON 导入、390px 页面、删除最后项目后重建。发现并修复四项：下一个 GA 按录入顺序显示、约束改变后旧候选残留、跨项目表单保留旧阶段 ID、空工作区导入错误不显示。
