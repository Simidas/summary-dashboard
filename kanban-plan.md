# Kanban Plan

## SD-PRIVACY-01

- stage：privacy boundary
- owner：Codex
- input_paths：`src/`、`js/`、`scripts/prepare-worker-assets.js`
- output_paths：代码、migration、robots 配置
- gate：访客无法读取数据，构建产物不含历史 JSON
- status：DONE
- downstream：SD-QA-01

## SD-QA-01

- stage：QA
- owner：Codex
- input_paths：本阶段代码与测试
- output_paths：测试和验证证据
- gate：语法、单测、构建、migration、隐私断言通过
- status：NEEDS_REVIEW
- downstream：SD-OWNER-01

## SD-OWNER-01

- stage：Owner Review
- owner：Weldon
- gate：确认登录页、Owner 数据和主要用户任务
- status：READY
- downstream：SD-LAUNCH-01

## SD-LAUNCH-01

- stage：private deploy
- owner：Codex + Weldon
- blocked_if：未获得生产部署授权或 Owner Review 未通过
- status：WAITING
