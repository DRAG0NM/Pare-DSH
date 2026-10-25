# Pare-DSH 开发计划

> 阶段 0 已核实官方 DSH 工具插件接口；插件 v0.2.0 已改用常驻 `pare serve`（协议 `pare.serve/1`），实现只读调查和带审批的写工具（阶段 1、4）。固定核心分发尚未实现；真实 DSH 端到端验证已完成。

## 阶段 0：宿主和接口核验（已完成）

- 宿主确认为 DeepSeek Harness。官方工具扩展采用 Cordis 插件的 `apply(ctx)`、`inject: ['tools']` 和 `@deepseek-ai/dsh-tools` 的 `defineTool`/`ctx.tools.register()`。
- 官方包文档使用 `dsh.bundle.patch` 声明插件层，通过 `dsh plugin --profile <name> add <package>` 安装。
- 固定本轮验证目标为 Harness `0.2.1-rc.2`、Cordis `4.0.5`、Node.js `>=22.19.0`；Harness 仍处于 developer preview，升级需重新验证。
- Pare Core 已有 `pare.scan/1`；`pare.plan/1` 尚不存在，因此只实现扫描工具，不注册计划工具。
- 源码安装时由用户提供 Core 可执行文件路径；插件不在线下载核心程序。
- 官方参考：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md>、<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md>、<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md>。

## 阶段 1：只读插件原型（已完成，已被 `pare serve` 取代）

- v0.1 的 `disk_scan`（现已移除，`reportDirectory` 选项一并移除）：目录路径作为参数单独传给 Core，shell 关闭；超时/取消会终止子进程。
- 报告限制为 64 MiB，校验 schema、节点种类、十进制字节数和错误代码；大整数以 BigInt 汇总。
- 返回计数和本地报告位置，不回传路径清单；退出码 3 会返回不完整报告摘要。
- 尚未实现 `disk_plan`：等待 Core 提供正式计划 schema。
- 已验证摘要和子进程边界测试；仍需在支持版本的真实 DSH host profile 中完成端到端测试。

## 阶段 2：固定核心分发（未完成）

- 现状：用户用 `PARE_CORE_PATH` 或 `parePath` 指向自己构建的 `pare.exe`（`go build -o pare.exe ./cmd/pare`）；插件只检查 `hello` 返回的协议名 `pare.serve/1`。
- 待做：选择随包附带或固定版本下载方案；加入 SHA-256 校验、核心版本兼容范围和可重复发布流程。
- 验收：核心文件被改动或版本不兼容时，插件拒绝执行；安装不携带用户扫描数据。

## 阶段 3：宿主集成和隐私审查（进行中）

- 已完成：使用模拟宿主和模拟核心的单元测试通过，覆盖调用、取消、超时、核心退出、审批返回值。
- 端到端验证：已完成。2026-10-25 在 DSH 0.2.1-rc.2（web，DeepSeek-V4.1-Flash）加 Pare 核心 0.3.0 上完成：pare_scan、pare_list_dir、pare_prepare_cleanup 正常；pare_execute 弹出审批，内容是插件保存的具体路径；点「拒绝」后调用被拒、文件未动；点「允许一次」后移入隔离区；pare_undo 审批后原样恢复；重新扫描后旧方案失效，新方案执行后 pare_purge 审批并永久删除，释放量与可用空间变化一致（3,145,728 字节）。
- 待做：检查用户名、目录路径和软件清单的最小化策略；确认真实 DSH 的审批服务在拒绝、取消、无人可答时均拒绝调用，且审批记入审计日志。
- 验收：响应不泄漏整份文件清单；用户能查看完整结果和扫描缺口。

## 阶段 4：写工具（已实现）

- 已实现 `pare_prepare_cleanup`、`pare_execute`、`pare_list_quarantine`、`pare_undo`、`pare_purge` 和 `pare_read_sensitive`。
- 审批：插件监听 DSH `tools/pre-execute`，对 `pare_execute`、`pare_undo`、`pare_purge`、`pare_read_sensitive` 返回 `{kind: 'ask'}`；只有一次性 `allowed-once` 放行，拒绝、取消、不可用均拒绝（失败即关闭），每次询问进入会话审计日志。
- `pare_execute` 的提示由插件保存的预览生成（确切路径和模板命令），不取自模型文字；未知 id 不经询问直接拒绝；一个清理 id 最多执行一次。
- 核心保证：受保护位置拒绝、`BuildSelected` 证据、执行前重验文件身份/改动/占用、模板校验、预览 digest 匹配、30 分钟过期、执行前标记已使用、`undo`/`purge` 只接受隔离区内的清单。
- 插件不提供原始 shell 命令。
- 验收项（过期、digest 不匹配、id 被替换、重放）在核心一侧有检查；宿主审批的真实行为已在端到端验证中确认（拒绝、允许一次）。

## 阶段 5：发布

- 选定插件包格式、支持的 DSH 版本、核心兼容矩阵和许可证。
- 发布工具 schema、校验和来源清单；不自动上报扫描内容。
- 验收：干净环境安装、版本升级/降级、离线读取现有报告均经过验证。
