# 课堂使用流程

[日本語](../ja/classroom.md) · [中文](../zh-CN/classroom.md) · [English](../en/classroom.md)

[教师入口](https://exp-all-in-one.vercel.app/teacher) · [学生入口](https://exp-all-in-one.vercel.app)

## 共用入口

旧地址 `doubleauction.vercel.app` 会保留路径和查询参数并转向新地址。原先在旧地址加入过房间的用户，需要在新地址重新进入一次。

各实验教师页面右上角的 **Demo Model** 可以直接体验，无需教师密钥或创建房间。Double Auction、EMH、Judgement under Uncertainty 分别使用 `/demo`、`/emh/demo`、`/judgment/demo`。Judgement 演示需要先选择任务；预览不保存回答，计时限制暂停。

- 在 `/teacher` 选择 **Double Auction**、**EMH** 或 **Judgement under Uncertainty** 并创建房间。所有实验的已有房间在同一个列表中管理。
- 学生在 `/` 输入房间代码、昵称和4位数字 PIN。Judgement under Uncertainty 的姓名栏会改为7位学号。平台根据房间代码识别实验，进入 `/room/[code]`。
- 教师重新进入和房间管理使用现有的房间密码及教师密钥。教师与学生的 Cookie 分开保存。
- Double Auction 的详细设置、制度、演示及已有房间均可继续使用。

## 重新进入与房间管理

登录 Cookie 按房间和角色区分。同一浏览器的普通标签页可以同时打开教师和学生画面。若模拟多个学生，应为每个学生使用独立设备或浏览器配置文件。学生首次进入时设置4位数字 PIN；再次进入时根据昵称和 PIN 恢复对应身份，教师 Cookie 不会覆盖学生身份。

教师页面的「ルーム管理」按新到旧列出已保存的房间，显示实验名、代码、创建时间、状态、市场数、参加人数、进度和各制度期数。可以按实验名或代码搜索，按创建年份或状态筛选，每次继续加载20条。「再入室」打开已填入代码的教师登录页。平台没有统一的个人教师账户；线上管理列表由共用的教师密钥保护，本地则显示同一计算机指定数据库中的房间。

在目标房间的确认页面点击「このルームを削除」删除房间，无需再次输入房间的教师密码，但服务端仍检查管理列表使用的教师密钥；未设置密钥的本地环境除外。参加者、市场、交易历史、审计日志和实验结果在同一事务中删除，正在实验的学生也会收到房间不存在的提示。删除不可恢复，需要的数据应先从教师页面下载。

---

[首页](../../../README.zh-CN.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH 资产市场实验](emh.md) · [Judgement under Uncertainty](judgment.md) · [开发、部署与验证](development.md)
