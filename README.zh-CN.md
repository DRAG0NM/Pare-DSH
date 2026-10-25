<p align="center">
  <img src="docs/images/zh-CN/banner.svg" alt="Pare-DSH —— 在 DeepSeek Harness 里使用 Pare 的 AI 磁盘调查" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <img alt="npm" src="https://img.shields.io/npm/v/@drag0nm/pare-dsh?style=flat-square&color=3a3a3a&labelColor=1b1b1b">
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Pare core" src="https://img.shields.io/badge/Pare%20core-0.4.0-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3a3a3a?style=flat-square&labelColor=1b1b1b">
</p>

Pare-DSH 把 [Pare](https://github.com/DRAG0NM/Pare) 的 AI 磁盘调查带进 DeepSeek Harness（DSH）。DSH 里的智能体用 Pare 的只读工具调查这台电脑上的磁盘浪费，并准备好清理方案。扫描、调查和清理都由独立的 Pare 核心完成；插件只负责启动核心、注册工具和发起审批。

在你于 DSH 自己的审批提示里批准之前，什么都不会改动；文件会被移入可撤回的隔离区，而不是直接删除。

<p align="center">
  <img src="docs/images/zh-CN/demo.gif" alt="DSH 会话：扫描、调查、审批和清理报告" width="100%">
</p>
<p align="center"><sub>在真实的 DSH 会话中对演示文件夹录制。</sub></p>

## 安装

```powershell
dsh plugin --profile web add @drag0nm/pare-dsh
```

重启该 profile（例如 `dsh web`）即可。不需要任何配置。首次启动时，插件会下载固定版本的 Pare 核心并校验（见[固定版本的核心](#固定版本的核心)）。

## 细看

<table>
  <tr>
    <td width="50%"><img src="docs/images/zh-CN/approval.png" alt="列出确切文件的 DSH 审批提示"><br><sub><b>审批</b> —— 提示在任何文件移动之前列出确切的文件。</sub></td>
    <td width="50%"><img src="docs/images/zh-CN/result.png" alt="清理后智能体给出的报告"><br><sub><b>结果</b> —— 清理后智能体的报告，说明保留了什么以及原因。</sub></td>
  </tr>
</table>

## 工具

插件启动一个常驻的 `pare serve` 进程（协议 `pare.serve/1`，通过标准输入输出收发按行分隔的 JSON），并注册下列工具。扫描索引保存在这个进程里，所以调查类工具要先调用 `pare_scan`。

| 工具 | 作用 | 需要批准 |
|---|---|:---:|
| `pare_scan` | 只读扫描一个盘或目录，在核心进程里保留索引 | 否 |
| `pare_scan_overview`、`pare_list_dir`、`pare_find_large_files`、`pare_same_size_files`、`pare_breakdown`、`pare_file_head`、`pare_read_text`、`pare_path_info`、`pare_installed_programs`、`pare_running_processes`、`pare_run_diagnostic` | 核心提供的只读调查工具。列表在插件启动时向核心询问（`hello`），随核心版本变化 | 否 |
| `pare_read_sensitive` | 读取被 Pare 标为敏感的文件内容（密钥、`.env`、浏览器登录数据、凭据库） | 是，每次 |
| `pare_prepare_cleanup` | 登记要移入隔离区的路径和受支持的动作模板，返回清理 id。此时不改动任何东西 | 否 |
| `pare_execute` | 按 id 执行一份已准备的清理 | 是 |
| `pare_list_quarantine` | 列出本地盘上的隔离批次及其内容 | 否 |
| `pare_undo` | 把一个隔离批次恢复到原位置，不覆盖已占用原路径的文件 | 是 |
| `pare_purge` | 永久删除一个隔离批次以释放空间，无法恢复 | 是 |

插件不提供原始 shell 命令。DSH 自带的 bash 工具有它自己的审批。

## 审批与安全

插件监听 DSH 的 `tools/pre-execute`，对 `pare_execute`、`pare_undo`、`pare_purge` 和 `pare_read_sensitive` 返回 `{kind: 'ask'}`。DSH 通过自己的审批服务询问你：只有一次性的 `allowed-once` 才会放行；你拒绝、取消，或没有可回答的一方时，调用一律被拒绝（失败即关闭）。每次询问都记入会话审计日志。

- `pare_execute` 的审批提示由插件保存的方案生成，列出确切的路径和模板命令，不取自模型的描述。
- 未知、已过期以及重新扫描之前的清理 id 会被直接拒绝，不会弹出询问。一个清理 id 最多执行一次。
- 取消一个正在运行的调用会停止核心进程；下一次调用会启动新进程，需要重新运行 `pare_scan`。

核心一侧还有独立的检查，不依赖宿主：

- 受保护的位置一律拒绝。
- 每个条目都带 `BuildSelected` 生成的证据。
- 执行器在移动每个文件之前，重新检查文件身份、是否被改动、是否被占用。
- 动作模板经过校验；预览的 digest 必须匹配；预览 30 分钟后过期。
- 执行开始前先把预览标记为已使用。
- `undo` 和 `purge` 只接受 Pare 隔离区内的清单。

隐私：调查工具会把路径和文件名返回给模型（以及它的服务商）。敏感文件的内容每次读取都要经过你的批准。

## 固定版本的核心

`package.json` 的 `pareCore` 固定了本插件版本使用的核心：版本 0.4.0、下载地址（GitHub `DRAG0NM/Pare` 的 `v0.4.0` 发布资产 `pare-0.4.0-win-x64.exe`）和 SHA-256 `23a09ed98b24642e80c1ee83d8a7464e6fa0df2ac1a1d6e078cd5882672001fb`。

未设置 `parePath` 和 `PARE_CORE_PATH` 时：

- 插件使用 `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe`（按用户保存在插件目录之外，重装或升级插件不会丢失）。文件不存在就按固定地址下载：先用 System32 里的 `curl.exe`（遵循 `HTTPS_PROXY`），失败再用 PowerShell 的 `Invoke-WebRequest`（使用 Windows 系统代理）。
- 下载完成后校验 SHA-256，匹配才保留；不匹配的下载文件会被删除。
- 之后每次启动，以及每次启动核心进程之前，都会再次校验哈希。文件被改动时插件拒绝运行（不会自动替换），错误信息会提示删除该文件以重新下载。
- `hello` 返回的版本必须等于固定版本，否则插件拒绝使用，不注册任何调查工具。
- 某些机器上 `AppData\Local` 启用了 EFS 加密，同目录内的重命名会被拒绝（EXDEV）；文件被杀毒软件短暂占用时也会拒绝。插件会重试几秒，仍不行就改为复制后删除临时文件，最终文件同样要通过哈希校验。

开发时可以用 `parePath` 配置或环境变量 `PARE_CORE_PATH` 指向自己构建的 `pare.exe`（`go build -o pare.exe ./cmd/pare`）。此时不做哈希校验，只检查协议名。

离线环境可以把同一个文件（SHA-256 一致）放到 `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe`，或设置 `parePath`。

`timeoutMs` 是单次调用的超时，默认 600000 毫秒。

## 环境要求

- Windows。
- DeepSeek Harness `0.2.1-rc.2`（Cordis `4.0.5`）。Harness 目前仍是 developer preview，接口可能发生不兼容变化；Pare-DSH 把 peer 版本固定在验证过的工具接口上，升级前需先重新测试。
- Node.js 22.19 或更新版本（DSH 自身的要求）。
- 首次启动时需要能访问 GitHub，以下载固定版本的核心。

## 从源码构建

```powershell
pnpm install
pnpm check
dsh plugin --profile web add .
```

已在 DSH 0.2.1-rc.2 中端到端验证，包括拒绝、允许、撤销和永久删除，以及从 npm 安装。

## 许可证

MIT，见 [LICENSE](LICENSE)。依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。核心是 [Pare](https://github.com/DRAG0NM/Pare)，同样使用 MIT 许可证。

## DSH 官方资料

- [Official Harness repository and release status](https://github.com/deepseek-ai/deepseek-harness)
- [Official first-plugin guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Official tool authoring guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Official plugin packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
