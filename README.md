# Pare-DSH

Pare-DSH 给 DeepSeek Harness 增加一个只读磁盘扫描工具。扫描交给独立的 Pare Core 执行；插件不复制扫描实现，也没有清理行为。

## 能力范围

`disk_scan` 接收一个 Windows 目录路径，通过参数数组运行 `pare scan`，校验 `pare.scan/1` 报告后返回摘要。完整报告保存在本地目录，不把目录清单和文件路径带入对话。

这个版本不生成清理计划。Pare Core 还没有计划 schema，也没有 apply 或 undo 工具。

## 环境要求

- Windows 和可运行的 Pare Core 程序。
- Node.js 22.19 或更新版本。
- DeepSeek Harness `0.2.1-rc.2`，Cordis `4.0.5`。

Harness 目前仍是 developer preview，接口可能发生不兼容变化。Pare-DSH 将 peer 版本固定在本次验证过的工具接口；升级前需先对新版本重新做兼容测试。

## 本地安装

```powershell
pnpm install
pnpm test
pnpm check
dsh plugin --profile web add .
```

启动 DSH 前，将 `PARE_CORE_PATH` 设为 `pare.exe` 的绝对路径，或在插件配置中填写 `parePath`。报告默认写入 `%LOCALAPPDATA%\Pare\Reports`；若系统未设置 `LOCALAPPDATA`，则使用系统临时目录。也可以通过 `reportDirectory` 指定报告目录。

插件入口在 [cordis.patch.yml](cordis.patch.yml) 中声明，工具按官方 `defineTool` 接口注册。`@deepseek-ai/dsh-tools` 保持为宿主 peer，避免在 profile 中再加载一份工具注册包。

依赖版本和许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 本地验证

```powershell
pnpm test
pnpm check
```

测试覆盖报告校验、摘要隐私、退出码和子进程参数边界。当前尚未在完整的 DSH profile 中启动宿主；发布前还需完成这项集成验证。

## 项目说明

Pare-DSH 由 DRAG0NM 以个人项目维护，通过 [Pare Core](https://github.com/DRAG0NM/Pare) 提供扫描能力，不复制核心实现。项目许可证尚未确定。

## DSH 官方资料

- [Official Harness repository and release status](https://github.com/deepseek-ai/deepseek-harness)
- [Official first-plugin guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Official tool authoring guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Official plugin packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
