# EMH 资产市场实验

[日本語](../ja/emh.md) · [中文](../zh-CN/emh.md) · [English](../en/emh.md)

实现位于 `src/experiments/emh/`，规则页为 `/emh/guide`，可在 `/emh/demo` 与8名虚拟参加者练习。来源是 [Session5-1（Exp1解説あり）.pdf](../../../material/emh/Session5-1（Exp1解説あり）.pdf) 中的实验1，详见[实施条件与原材料对应（日文）](../../experiments/emh.md)。Session6-1 的实验2仅保留为参考材料，尚未实现。

1. 设置实验名和至少8位的教师密码，必要时输入管理员提供的教师密钥，创建房间并将代码分享给全班。
2. 至少3人加入后，点击「受付を終了して自動分け」，随机分配全部参加者。市场数以总人数除以9并四舍五入为基础，每市场3至12人，市场间最多差1人。三种类型在各市场和全班尽量均衡。例如30人分为3个10人市场；100人分为1个10人市场和10个9人市场。接收加入期间显示预计分配，只有开始前可以重新开放加入。每房间注册上限为999人。
3. 点击「全市場で実験を開始」同时开始。各市场独立推进交易、分红和时钟。教师可以切换市场、暂停或恢复全部市场，以及结束所选市场的当前期。
4. 每轮每人初始持有2单位，市场总供给为参加人数乘以2。A期持仓延续至B期，B期结束时证券消失。下一轮重置初始持仓和买卖收支，累计得分保留。最大分红及效率的分母也根据实际市场规模计算。
5. 固定6轮，A/B期各240秒，每次交易30秒，休息60秒。连续两次未成交则进入期末。三类的A/B分红分别为216/105、200/110、257/83，当前设置页固定这些值。理论价格为A期340/367、B期110。
6. 实验结束后由教师明确发布解说；此前不会向学生发送其他类型的分红、其他人的成绩或理论价格。教师可按市场或汇总全部市场导出 CSV，汇总版含市场编号；条件和分配以 JSON 导出。学生 CSV 仅含本人历史。

所有实验通过 `lab_room_registry` 保证房间代码唯一。除现有 `auction_*` 表外，EMH 使用 `emh_sessions`、`emh_markets`、`emh_command_receipts` 和 `emh_login_attempts`。连接时的迁移会建立表并登记旧代码，不需要额外的数据库连接字符串。模块使用市场行锁、数据库时间和操作ID处理重试，读取状态时也处理到期事件。学生只能获取所在市场，教师可以获取汇总及所选市场；正式分红值保存在服务端文件中。

统一版已有本地和 Vercel + Neon 的验证记录，见[迁移与验证记录（英文）](../../releases/unified-platform-migration.md)。未导入旧 Judgment 的 SQLite 数据。本地测试应设置 `LOCAL_ONLY=1` 和独立的 `PGLITE_DATA_DIR`，并清空 `DATABASE_URL`、`LOCAL_DATABASE_URL`。不要让多个服务器同时打开同一 PGlite 数据库。999人是注册上限，不代表已保证云端的同等并发能力。

启动本地服务器后，可运行 `npx tsx scripts/verify-emh-http.ts`，默认地址为 `http://127.0.0.1:3200`，通过 `EMH_TEST_ORIGIN` 修改。请使用未设置教师密钥的独立本地数据库；脚本会创建测试房间。

`tests/emh-engine.test.ts` 和 `tests/emh-platform.test.ts` 覆盖各人数的分配、30人并行市场、私有信息、重新进入、重试与同时成交、时钟、完整6轮、分红、主动发布解说，以及共用房间代码与管理。

---

[首页](../../../README.zh-CN.md) · [课堂使用流程](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [Judgement under Uncertainty](judgment.md) · [开发、部署与验证](development.md)
