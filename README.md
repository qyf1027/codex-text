# IPD Smart Tracker

本地优先的 IPD 项目管理 Web App。新用户可先看 [图解使用说明书](IPD-图解使用说明书.html)。下载 [独立 HTML](IPD-Smart-Tracker.html) 可直接尝试打开；完整源代码在 [web/](web/)，运行和测试命令见 [Web App 使用说明](web/README.md)。

首次打开会提供原 ZIP 的 55 项 IPD 任务模板。可以创建项目、维护阶段/任务/GA/成果、设置跨项目依赖和独占资源预约，查看风险与排期候选，再由用户采纳。数据保存在当前浏览器；换电脑或清除浏览器数据前，请用“完整备份”下载 JSON，并在新浏览器恢复。

需求基线见 [PRD](docs/requirements/IPD_Smart_Tracker_PRD_v1.0.md)，算法见 [说明](docs/ALGORITHM.md)，测试对应见 [验收记录](docs/ACCEPTANCE.md)，示例完整备份见 [JSON](examples/ipd-default-workspace.json)。`preview.html` 是旧预览，与正式应用数据互不相通。
