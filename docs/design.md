# Pare-DSH 设计稿

> 状态：只读调查与带审批的写工具已实现（插件 v0.2.0，核心 v0.3.0，协议 `pare.serve/1`，DSH 0.2.1-rc.2）。真实 DSH 端到端验证进行中；固定核心分发（下载加 SHA-256 校验）已实现，Pare v0.4.0 的发布待完成。

## 1. 目标

Pare-DSH 将 Pare Core 的本地扫描与计划能力封装为 Agent 工具，使 Agent 能读取占用摘要、生成供用户审阅的计划，并解释计划证据。插件不负责识别垃圾文件，不维护第二份规则库，也不直接访问目标文件系统。

DSH 宿主的 SDK、工具注册协议、审批 API、权限声明和 sidecar 分发能力尚未取得一手验证。因此本文将“DSH 接入”视为待核实项，不声称任何宿主审批已经闭环。

## 2. 系统边界

```text
DSH host
  └─ pare-dsh adapter
       ├─ validates tool arguments and bounded output
       ├─ starts pinned Pare Core CLI
       ├─ parses versioned JSON responses
       └─ returns summary + local result reference

Pare Core (separate repository and release)
  ├─ scanner
  ├─ rules and probes
  ├─ plan builder
  └─ gated executor
```

插件与核心通过本机子进程和版本化 JSON 交互。首版不引入本地 HTTP 服务、远程账户或后台 daemon。CLI 退出码、schema 版本、超时、取消和标准错误处理在接口测试中固定。

## 3. 工具契约

已实现。插件启动一个常驻 `pare serve` 进程，按行分隔的 JSON 通过标准输入输出通信（`{"id","method","params"}` 对应 `{"id","result"}` 或 `{"id","error"}`），请求按顺序处理。插件启动时另用一次性进程发送 `hello`，取得协议名、核心版本和调查工具列表；协议名不是 `pare.serve/1` 时拒绝使用。

| 工具 | 核心方法 | 作用 | 审批 |
|---|---|---|:---:|
| `pare_scan` | `scan` | 只读扫描，索引留在核心进程内；参数为绝对 Windows 路径 | 否 |
| `pare_<name>`（`scan_overview`、`list_dir`、`find_large_files`、`same_size_files`、`breakdown`、`file_head`、`read_text`、`path_info`、`installed_programs`、`running_processes`、`run_diagnostic`） | `tool` | 只读调查；列表来自核心的 `hello` | 否 |
| `pare_read_sensitive` | `read_sensitive` | 读取敏感文件内容，仅对这一次调用授权 | 是 |
| `pare_prepare_cleanup` | `prepare` | 登记隔离路径和动作模板，返回 id 与预览；不改动任何东西 | 否 |
| `pare_execute` | `execute` | 按 id 执行，先隔离后跑模板 | 是 |
| `pare_list_quarantine` | `batches` | 列出隔离批次 | 否 |
| `pare_undo` | `undo` | 恢复一个批次 | 是 |
| `pare_purge` | `purge` | 永久删除一个批次 | 是 |

写类工具的参数只接受核心签发的清理 id 或隔离清单路径，以及核心支持的动作模板名和字符串参数；不接受任意 shell 命令、glob 或规则覆盖项。插件不提供原始 shell，DSH 自带的 bash 工具有自己的审批。

返回给模型的内容限制长度：预览最多列出 40 项。调查工具会把路径和文件名交给模型及其服务商；敏感文件内容每次读取都要用户批准。完整索引保留在核心进程内，不写入本地报告文件。旧的 `disk_scan` 和 `reportDirectory` 已移除，`disk_plan` 没有实现，由 `pare_prepare_cleanup` 取代。

## 4. 核心程序获取和版本兼容

> 已实现（插件 v0.3.0）：不把二进制放进 git，而是首次启动时按固定地址下载并校验 SHA-256。`package.json` 的 `pareCore` 记录版本 0.4.0、下载地址（`DRAG0NM/Pare` v0.4.0 发布资产 `pare-0.4.0-win-x64.exe`）和 SHA-256。`parePath`、`PARE_CORE_PATH` 仍可覆盖固定版本，供开发使用（不做哈希校验，只检查协议名）。
>
> 未设置覆盖时，插件使用 `%LOCALAPPDATA%\Pare\core\pare-<版本>.exe`；文件不存在则下载（先 System32 的 `curl.exe`，遵循 `HTTPS_PROXY`；失败再用 PowerShell `Invoke-WebRequest`，使用系统代理），校验通过才保留，不匹配即删除。每次启动和每次启动核心进程前再次校验；被改动的文件被拒绝而不是替换，提示删除后重新下载。`hello` 报告的版本必须等于固定版本，否则拒绝并且不注册调查工具。`core` 目录已加入 `.gitignore`。
>
> 2026-10-25 Pare v0.4.0 已发布，GitHub 记录的 pare-0.4.0-win-x64.exe 摘要与固定值一致；插件的下载代码从发布地址下载并校验通过（5,659,136 字节，报告版本 0.4.0）。

插件使用 Pare 的固定发布版本，不解析浮动的 `latest`。安装或更新时校验下载来源、版本及 SHA-256；核心版本与插件声明的兼容 schema 不符时，停止调用并提示升级/降级。发布资产不得携带本机扫描数据、日志或用户凭据。

分发方式选择了首次启动下载，而不是随包附带 sidecar：下载的只是固定版本，且只有 SHA-256 与固定值一致才会运行，不会下载或执行未知版本。

## 5. 审批和威胁边界

读操作会返回用户名、项目路径和软件清单，这些内容会发送给模型服务商。扫描范围由用户给定的根路径限定；插件不把路径解释成 shell 参数，也不拼接未经参数化的数据。

### 宿主审批（已实现）

插件监听 DSH 的 `tools/pre-execute`，对 `pare_execute`、`pare_undo`、`pare_purge`、`pare_read_sensitive` 返回 `{kind: 'ask'}`。DSH 通过审批服务询问用户：

- 只有一次性的 `allowed-once` 才放行；拒绝、取消、或没有可回答的一方（不可用）都拒绝调用，即失败即关闭。
- 每次询问都记入会话审计日志。
- `pare_execute` 的提示由插件保存的预览生成，列出确切路径和模板命令，不取自模型的文字。
- 未知的清理 id 不经询问直接拒绝；一个清理 id 最多执行一次（插件在调用前就删除本地预览，核心也在运行前标记已使用）。
- `undo`、`purge` 的提示只包含批次清单路径；清单是否在 Pare 隔离区内由核心检查。

“失败即关闭”和审计日志由 DSH 的审批服务提供，插件代码里没有重复实现，行为以 DSH 0.2.1-rc.2 为准，端到端验证完成前不视为已确认。

### 核心保证（已实现，与宿主审批独立）

1. 受保护位置拒绝隔离，每个条目由 `BuildSelected` 生成证据。
2. 执行器在移动每个文件前重新检查文件身份、改动和占用。
3. 动作模板经过校验；预览 digest 必须匹配；预览 30 分钟后过期；`execute` 在运行前把预览标记为已使用，失败也不能重放。
4. `undo`、`purge` 只接受 Pare 隔离区内的清单。
5. 重新 `scan` 会清空核心里所有已准备的清理。

模型无法把其他路径或命令塞进执行参数：`pare_execute` 只带 id，路径和模板来自先前的预览。插件不通过 prompt 约束冒充权限隔离。

### 仍未完成

- 审批提示对超过 40 项的清理只列出前 40 项，其余只显示数量。
- 动作模板的命令不能由 Pare 撤回，用户只能在批准前审阅。

## 6. 失败处理

- 核心不存在、摘要不匹配、版本不支持：不执行，返回安装或版本错误。
- 超时或取消：终止核心进程，报告任务未完成；不把部分结果当完整扫描。
- JSON 非法、schema 不支持或退出码表示部分失败：标记不完整并保留诊断引用。
- DSH 审批状态缺失或不明确：拒绝写操作（由 DSH 审批服务失败即关闭保证）。
- 输出超过限制：截断展示摘要并保留本地报告引用，不丢弃错误状态。

## 7. 验收标准

- 插件只调用固定的核心命令和结构化参数，不执行通用 shell 字符串。
- 扫描/计划工具在没有管理员权限和无网络环境下能按 Pare 能力工作。
- 版本不匹配、摘要错误、超时、取消、非法 JSON 和部分扫描均显示为失败或不完整。
- 扫描范围及路径暴露情况在工具说明和响应中可见。
- 写工具每次调用都经过宿主的一次性审批；未知 id、已用 id、被拒绝、被取消和无人可答均不执行。该项由单元测试（模拟宿主）覆盖，真实 DSH 验证进行中。
