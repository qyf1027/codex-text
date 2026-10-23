# IPD Smart Tracker（HTML 预览版）

先打开 [preview.html](preview.html) 体验原 IPD 任务流程。它是单个自包含 HTML 文件，不需安装依赖或配置 Gemini。浏览器会把修改保存在当前浏览器的本地存储；请定期使用“导出项目”备份 JSON。清除浏览器站点数据可能删除本地项目。

页面含原始 ZIP 的 55 个任务、按工作日计算的标准预测、任务状态/日期/耗时编辑、多项目切换、未采纳的压缩候选和项目 JSON 导入导出。新建项目会复制一套 IPD 示例任务。计划日期按周一至周五计算，开始日算第 1 个工作日；串行依赖从前置任务结束后的下一工作日启动。

也可运行本地服务以便开发：

```sh
python3 -m http.server 8008
```

然后在浏览器打开 `http://127.0.0.1:8008/`。`index.html`、`style.css`、`core.mjs`、`app.mjs` 和 `seed.json` 是 HTML 预览版的源文件。修改后执行 `python3 scripts/build-preview.py` 更新单文件 `preview.html`。运行 `node --test tests/core.test.mjs` 检查日期与排期基础规则。

此版本先供界面和原流程体验，**尚未达到 PRD V1**：缺少成果节点与版本、跨项目依赖、资源预约、计划版本采纳、风险历史、IndexedDB 持久化和 Gemini。压缩区明确为未采纳的简单候选，不保证满足完整 PRD 约束。开发基线见 [PRD](docs/requirements/IPD_Smart_Tracker_PRD_v1.0.md)。
