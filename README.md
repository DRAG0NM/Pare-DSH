# Pare-DSH

Pare-DSH（v0.2.0）让 DeepSeek Harness（DSH）里的 AI 调查这台电脑上的磁盘浪费，并在用户逐次批准后做可撤回的清理。扫描、调查和清理都由独立的 Pare 核心完成；插件不复制核心的实现，只负责启动核心、注册工具和发起审批。

## 能力范围

插件启动一个常驻的 `pare serve` 进程（核心 v0.3.0，协议 `pare.serve/1`，通过标准输入输出收发按行分隔的 JSON），并在 DSH 0.2.1-rc.2 中注册下列工具。扫描索引保存在这个进程里，所以调查类工具要先调用 `pare_scan`。

| 工具 | 作用 | 需要用户批准 |
|---|---|:---:|
| `pare_scan` | 只读扫描一个盘或目录，在核心进程里保留索引 | 否 |
| `pare_<name>` | 核心提供的只读调查工具，包括 `scan_overview`、`list_dir`、`find_large_files`、`same_size_files`、`breakdown`、`file_head`、`read_text`、`path_info`、`installed_programs`、`running_processes`、`run_diagnostic`。列表在插件启动时向核心询问（`hello`），随核心版本变化 | 否 |
| `pare_read_sensitive` | 读取被 Pare 标为敏感的文件内容（密钥、`.env`、浏览器登录数据、凭据库） | 是，每次 |
| `pare_prepare_cleanup` | 登记要移入隔离区的路径和受支持的动作模板，返回清理 id。此时不改动任何东西 | 否 |
| `pare_execute` | 按 id 执行一份已准备的清理 | 是 |
| `pare_list_quarantine` | 列出本地盘上的隔离批次及其内容 | 否 |
| `pare_undo` | 把一个隔离批次恢复到原位置，不覆盖已占用原路径的文件 | 是 |
| `pare_purge` | 永久删除一个隔离批次以释放空间，无法恢复 | 是 |

插件不提供原始 shell 命令。DSH 自带的 bash 工具有它自己的审批。

## 审批与安全

插件监听 DSH 的 `tools/pre-execute`，对 `pare_execute`、`pare_undo`、`pare_purge` 和 `pare_read_sensitive` 返回 `{kind: 'ask'}`。DSH 通过自己的审批服务询问用户：只有一次性的 `allowed-once` 才会放行；用户拒绝、取消，或没有可回答的一方时，调用一律被拒绝（失败即关闭）。每次询问都记入会话审计日志。

- `pare_execute` 的审批提示由插件保存的预览生成，列出确切的路径和模板命令，不取自模型的描述。
- 未知的清理 id 直接拒绝，不会弹出询问。一个清理 id 最多执行一次。

核心一侧还有独立的保证，不依赖宿主：

- 受保护的位置一律拒绝。
- 每个条目都带 `BuildSelected` 生成的证据。
- 执行器在移动每个文件之前，重新检查文件身份、是否被改动、是否被占用。
- 动作模板经过校验；预览的 digest 必须匹配；预览 30 分钟后过期。
- 执行开始前先把预览标记为已使用。
- `undo` 和 `purge` 只接受 Pare 隔离区内的清单。

隐私：调查工具会把路径和文件名返回给模型（以及它的服务商）。敏感文件的内容每次读取都要用户批准。

取消一个正在运行的调用会停止核心进程；下一次调用会启动新进程，需要重新运行 `pare_scan`。

## 环境要求

- Windows。
- Node.js 22.19 或更新版本。
- DeepSeek Harness `0.2.1-rc.2`，Cordis `4.0.5`。
- 支持 `pare serve` 的 Pare 核心（v0.3.0 起），用核心仓库构建：`go build -o pare.exe ./cmd/pare`。

Harness 目前仍是 developer preview，接口可能发生不兼容变化。Pare-DSH 将 peer 版本固定在本次验证过的工具接口；升级前需先对新版本重新做兼容测试。

## 本地安装

```powershell
pnpm install
pnpm test
pnpm check
dsh plugin --profile web add .
```

启动 DSH 前，将环境变量 `PARE_CORE_PATH` 设为 `pare.exe` 的绝对路径，或在插件配置中填写 `parePath`。`timeoutMs` 是单次调用的超时，默认 600000（毫秒）。旧版的 `reportDirectory` 选项和 `disk_scan` 工具已经移除。

插件入口在 [cordis.patch.yml](cordis.patch.yml) 中声明，工具按官方 `defineTool` 接口注册。`@deepseek-ai/dsh-tools` 保持为宿主 peer，避免在 profile 中再加载一份工具注册包。

依赖版本和许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 本地验证

```powershell
pnpm test
pnpm check
```

单元测试使用模拟宿主和模拟核心，覆盖协议、工具注册、审批返回值和结果文本。端到端验证（真实 DSH 加真实核心）：2026-10-25 在 DSH 0.2.1-rc.2（web，DeepSeek-V4.1-Flash）加 Pare 核心 0.3.0 上完成：pare_scan、pare_list_dir、pare_prepare_cleanup 正常；pare_execute 弹出审批，内容是插件保存的具体路径；点「拒绝」后调用被拒、文件未动；点「允许一次」后移入隔离区；pare_undo 审批后原样恢复；重新扫描后旧方案失效，新方案执行后 pare_purge 审批并永久删除，释放量与可用空间变化一致（3,145,728 字节）。

## 项目说明

Pare-DSH 由 DRAG0NM 以个人项目维护，通过 [Pare 核心](https://github.com/DRAG0NM/Pare)提供全部磁盘能力。核心使用 MIT 许可证；插件自身的许可证尚未确定。

## DSH 官方资料

- [Official Harness repository and release status](https://github.com/deepseek-ai/deepseek-harness)
- [Official first-plugin guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Official tool authoring guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Official plugin packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
