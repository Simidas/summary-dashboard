# Private Tool Review Plan

## Owner 验收

- Google OAuth 登录成功，非 Owner 被拒绝。
- 首页、Records、Diary、Weekly、Monthly 可读取 Owner 数据。
- 新建、编辑和删除记录均保持 private。
- AI 总结不泄露给访客，退出登录后私有 API 恢复 401。
- 桌面端与手机端各完成一次核心任务。

## 首周观察

- 每天是否完成记录，主要中断发生在哪一步。
- Weekly/Monthly 总结是否减少人工整理时间。
- AI 输出是否需要反复改写，以及主要失败类型。
- 页面加载、保存和登录是否出现可复现故障。

## 决策

- Iterate：出现阻断核心记录或复盘流程的问题。
- Keep：核心任务稳定，改进仅是体验优化。
- Remove：未被真实使用且增加维护成本的功能。
