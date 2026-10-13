# 教授反馈：本地实现与验收记录

2026-10-13。仅本地开发和测试；未 push、未部署、未连接或修改生产数据库，未运行收费或云端压测。

## 已确认的规则

- Call 公开本市场买卖报价、剩余数量和最佳买卖价，仍仅在清算时撮合；每轮一次提交，不增加接受、修改或撤单权限。
- Posted 卖方报价阶段后，所有买方同时提交 Bid，每 1 秒集中撮合。截止时仍有效且在截止前到达的买单参与该批；同价买单在该批内抽签，保存候选和结果。
- 最高 Bid 对最低 Offer，只有 Bid ≥ Offer 才成交；价格为卖方报价；同价卖单按提交顺序；买单不允许修改或撤销。
- 买方共同交易时间默认沿用旧总预算（每人秒数 × 买方人数），教师可调整；默认 16 人市场为 80 秒。
- 独立教师身份与历史归属仅整理方案，不实施认证或权限变更。

## 已完成

### Call 与时钟

学生端复用订单簿，并以字段白名单公开订单；不公开其他人的私人价值、成本、真实姓名或认证信息，不跨市场展示订单。

倒计时文案为「次の清算まで」，基于服务端 deadline 和校准时间；暂停冻结、恢复重新计算 deadline、重连重新取得服务端状态。5 秒配置已通过清算、暂停／恢复、重连及四轮后进入下一期测试。默认仍为原来的 30 秒，没有覆盖已有房间配置。说明、指南及原先断言 Call 订单簿为空的测试已更新。

### Posted

新房间和 Demo 使用 `batch-bids-v1`，新增真实 Bid 及双边订单簿，共同倒计时显示「取引終了まで」。服务端检查买方角色、阶段、剩余额度与已挂数量；市场事务锁和请求回执防止并发超买、超卖及重复执行。

抽签候选、排序、截止时间及撮合结果通过既有操作日志保存。重复请求或同一次清算的重读不会重抽；截止后到达的买单不能参与过去批次。各批次均可对仍有效的同价买单重新形成该批的候选集合。

**兼容边界：没有 `studyPostedMechanism` 标记的旧房间保留原逐人购买协议。** 本次没有自动迁移旧房间或修改进行中的实验；请新建本地房间体验新规则。卖方两单位报价方式和供需生成参数未改变。

### 导航与 CSV

正式教师房间的返回／品牌链接带回教师管理与房间上下文；刷新后保留入口提示。提示不参与授权，服务端实际学生角色优先于 URL 提示。失效凭证只显示教师重新验证入口。Demo 返回 Demo 设置，学生仍走学生入口。

复用交易、统计、操作日志 CSV 及条件 JSON，当前教师页有显式下载入口，历史管理中已结束房间标注「結果・ダウンロード / 再入室」。保留房间教师验证；空 CSV 返回日文提示，格式无效返回错误。CSV 使用 UTF-8 BOM、CRLF、双引号转义和文本公式防护；负数数值仍为数值。无 XLSX 或新工作簿依赖。

## 修改文件

| 范围            | 文件                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 撮合与公开状态  | `src/lib/posted-auction.ts`（新增）、`study-core.ts`、`study-view.ts`、`study-types.ts`、`types.ts`                                                                                                                                     |
| 配置与说明      | `src/lib/study-timing.ts`、`study-room-config.ts`、`study-rules.ts`、`src/components/study-settings.tsx`、`study-timing-settings.tsx`、`src/app/guide/page.tsx`、`README.md`                                                            |
| 学生／Demo 界面 | `src/components/study-room.tsx`、`study-order-book.tsx`、`study-market-history.tsx`、`demo-entry.tsx`、`demo-room.tsx`、`src/lib/demo.ts`、`src/styles/study.css`                                                                       |
| 教师导航        | `src/lib/room-navigation.ts`（新增）、`src/components/room.tsx`、`shell.tsx`、`teacher-form.tsx`、`teacher-rooms.tsx`、`src/app/room/[code]/page.tsx`、`src/app/teacher/page.tsx`                                                       |
| 导出与服务      | `src/components/export-downloads.tsx`（新增）、`src/lib/exports.ts`（新增）、`src/components/teacher-dashboard.tsx`、`src/lib/server/export.ts`、`study-export.ts`、`http.ts`、`service.ts`、`src/app/api/rooms/[code]/export/route.ts` |
| 新增测试        | `tests/posted-bids.test.ts`、`tests/navigation-exports.test.ts`                                                                                                                                                                         |
| 更新测试        | `tests/study.test.ts`、`study-service.test.ts`、`study-institutions.test.ts`、`study-history.test.ts`、`study-feedback.test.ts`、`demo.test.ts`、`demo-setup.test.ts`、`tests/e2e/teacher-form.spec.ts`、`classroom.spec.ts`            |
| 本地验证隔离    | `next.config.ts` 增加可选 `LOCAL_NEXT_DIST_DIR`，未设置时仍使用 `.next`                                                                                                                                                                 |
| 身份方案        | `docs/teacher-ownership-plan.md`（新增）                                                                                                                                                                                                |

开始前已有的 `study-order-book` 组件、库、样式与测试改动已保留；原始补丁保存在 `work/feedback-review/pre-existing.patch`。本次在组件与样式上增量修改，没有覆盖已有订单簿拥挤布局工作。Next 验证构建生成的 `next-env.d.ts`、`tsconfig.json` 临时路径已还原。

## 验证结果

- 自动化测试：220 项，219 通过，0 失败，1 跳过。包含 CDA 价格／时间优先、收益、库存、阶段流程的原有回归测试，以及新 Call／Posted／导航／CSV／房间级授权测试。
- TypeScript、ESLint、本地生产模式构建通过。
- HTTP 实测使用独立本地 PGlite，云端数据库环境变量置空；Call 5 秒清算、暂停恢复、CSV BOM、空数据 422、未登录 401、学生 403、跨房间凭证拒绝均通过。
- 使用 Codex 内置浏览器验证正式教师再入室、返回管理、刷新、历史结果入口、认证失效、学生访问教师提示 URL、Call 双边订单簿与暂停倒计时、Posted 挂单后下一批按卖价成交、Demo CDA 下单和返回设置。
- Posted 浏览器案例：买方 Bid 100 円先出现在订单簿，清算时按 Offer 80 円成交，卖方剩余库存由 2 变为 1。
- 当前实验 CSV 已通过浏览器实际下载；历史空房间下载明确提示尚无交易。
- 浏览器验证的 Call／Posted 页面未发现 JavaScript 报错。

本地证据（`work/` 为忽略目录）：`work/feedback-review/final-tests.log`、`build.log`、`http-check.log`、`call-student.png`、`posted-student.png`。

## 待确认／未实施

按用户选择，没有新增教师账号、会话、归属字段或 owner 权限校验。现有共享密钥仍不能区分教师，管理列表仍不是“我的实验”。方案见 [教师身份与历史实验归属方案](teacher-ownership-plan.md)，包括服务端全接口授权和旧房间保持未归属的审核迁移流程。实施前需另行批准。

## 未验证及限制

- 独立 PostgreSQL 测试因没有 `LOCAL_TEST_DATABASE_URL` 跳过；本次数据库集成与并发测试使用本地 PGlite。
- 未运行 192 人持续 90 分钟压测，未测试 Vercel／Neon 线上性能。
- 未在真实 Excel 桌面程序中打开文件；已验证 UTF-8 BOM、日文、逗号／引号／换行、公式文本转义及实际浏览器下载。
- Playwright CLI 端到端套件没有执行；相关导航预期已更新，本次浏览器验证通过 Codex 内置浏览器完成。
- 数据隔离测试验证的是现有房间级凭证边界，不能代替尚未实施的教师账号归属隔离。
- 线上仍是原部署。本次所有机制修改和验证均仅在本地。
