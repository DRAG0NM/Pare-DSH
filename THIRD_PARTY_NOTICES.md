# Third-Party Notices

Pare-DSH does not vendor or redistribute DeepSeek Harness. The supported host supplies the Cordis and tool-registry packages at runtime. These notices record the versions used for development and compatibility checks.

| Package | Version | License | Use |
|---|---|---|---|
| `@deepseek-ai/dsh-tools` | `0.2.1-rc.2` | MIT | Peer dependency; official tool definition and registration API |
| `@deepseek-ai/cordis` | `4.0.5` | MIT | Peer dependency; official plugin context |
| `@deepseek-ai/schemastery` | `3.18.5` | MIT | Runtime dependency; plugin configuration schema |

The matching `@deepseek-ai/dsh-*` packages in `devDependencies` are used only to load and test the official tool API locally. The installed DSH host provides its own runtime copies. Package source and terms are available from the [official Harness repository](https://github.com/deepseek-ai/deepseek-harness), which is licensed under MIT.

Pare-DSH does not bundle the Pare core either. On first start it downloads the pinned `pare-<version>-win-x64.exe` from the [Pare releases](https://github.com/DRAG0NM/Pare/releases) (MIT, same author) and verifies its SHA-256; the core's own third-party notices are in that repository.
