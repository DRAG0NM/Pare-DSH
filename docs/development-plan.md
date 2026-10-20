# Pare-DSH 开发计划

> 阶段 0 已核实官方 DSH 工具插件接口；阶段 1 的只读 `disk_scan` 原型已完成本地验证。计划预览生成和写工具仍未实现。

## 阶段 0：宿主和接口核验（已完成）

- 宿主确认为 DeepSeek Harness。官方工具扩展采用 Cordis 插件的 `apply(ctx)`、`inject: ['tools']` 和 `@deepseek-ai/dsh-tools` 的 `defineTool`/`ctx.tools.register()`。
- 官方包文档使用 `dsh.bundle.patch` 声明插件层，通过 `dsh plugin --profile <name> add <package>` 安装。
- 固定本轮验证目标为 Harness `0.2.1-rc.2`、Cordis `4.0.5`、Node.js `>=22.19.0`；Harness 仍处于 developer preview，升级需重新验证。
- Pare Core 已有 `pare.scan/1`；`pare.plan/1` 尚不存在，因此只实现扫描工具，不注册计划工具。
- 源码安装时由用户提供 Core 可执行文件路径；插件不在线下载核心程序。
- 官方参考：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md>、<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md>、<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md>。

## 阶段 1：只读插件原型（已完成基础纵切片）

- 已实现 `disk_scan`：目录路径作为参数单独传给 Core，shell 关闭；超时/取消会终止子进程。
- 报告限制为 64 MiB，校验 schema、节点种类、十进制字节数和错误代码；大整数以 BigInt 汇总。
- 返回计数和本地报告位置，不回传路径清单；退出码 3 会返回不完整报告摘要。
- 尚未实现 `disk_plan`：等待 Core 提供正式计划 schema。
- 已验证摘要和子进程边界测试；仍需在支持版本的真实 DSH host profile 中完成端到端测试。

## 阶段 2：固定核心分发

- 选择随包附带或固定版本下载方案。
- 加入 SHA-256 校验、schema 兼容范围和可重复发布流程。
- 验收：核心文件被改动或版本不兼容时，插件拒绝执行；安装不携带用户扫描数据。

## 阶段 3：宿主集成和隐私审查

- 使用 DSH host fixture 做调用、输出大小、取消、超时和权限声明集成测试。
- 检查用户名、目录路径和软件清单的最小化策略。
- 验收：响应不泄漏整份文件清单；用户能查看本地完整结果和扫描缺口。

## 阶段 4：评估写工具（单独立项）

- 只有审批信号能绑定计划摘要、选择、动作、有效期和单次执行时，才起草 apply/undo 设计。
- 对接 Pare Core executor 的受控 plan ID 接口，不把裸路径传给核心。
- 验收：审批被取消、过期、摘要不匹配、ID 被替换或核心版本不兼容时均拒绝；执行细节另设安全测试集。

## 阶段 5：发布

- 选定插件包格式、支持的 DSH 版本、核心兼容矩阵和许可证。
- 发布工具 schema、校验和来源清单；不自动上报扫描内容。
- 验收：干净环境安装、版本升级/降级、离线读取现有报告均经过验证。
