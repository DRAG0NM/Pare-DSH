<p align="center">
  <img src="docs/images/ja/banner.svg" alt="Pare-DSH — DeepSeek Harness で使う Pare の AI ディスク調査" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <b>日本語</b> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <img alt="npm" src="https://img.shields.io/npm/v/@drag0nm/pare-dsh?style=flat-square&color=3a3a3a&labelColor=1b1b1b">
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Pare core" src="https://img.shields.io/badge/Pare%20core-0.4.0-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3a3a3a?style=flat-square&labelColor=1b1b1b">
</p>

Pare-DSH は、[Pare](https://github.com/DRAG0NM/Pare) の AI ディスク調査を DeepSeek Harness（DSH）に取り込むプラグインです。DSH のエージェントが Pare の読み取り専用ツールでこの PC のディスクの無駄を調べ、クリーンアップを準備します。スキャン、調査、クリーンアップはすべて別プロセスの Pare コアが行い、プラグインはコアの起動、ツールの登録、承認の要求だけを担当します。

DSH 自身の承認プロンプトで承認するまで、何も変更されません。ファイルは削除されず、元に戻せる隔離領域へ移動されます。

<p align="center">
  <img src="docs/images/en/demo.gif" alt="DSH のセッション：スキャン、調査、承認、クリーンアップのレポート" width="100%">
</p>
<p align="center"><sub>デモ用フォルダーを使い、実際の DSH セッションで録画しました。DSH のインターフェースは英語と中国語のみのため、画像は英語のインターフェースです。</sub></p>

## インストール

```powershell
dsh plugin --profile web add @drag0nm/pare-dsh
```

プロファイルを再起動します（例：`dsh web`）。設定は不要です。初回起動時に、プラグインが固定バージョンの Pare コアをダウンロードして検証します（[固定されたコア](#固定されたコア)を参照）。

## 画面で見る

<table>
  <tr>
    <td width="50%"><img src="docs/images/en/approval.png" alt="対象ファイルを正確に列挙する DSH の承認プロンプト"><br><sub><b>承認</b> — ファイルが移動される前に、承認プロンプトが対象ファイルを正確に列挙します。</sub></td>
    <td width="50%"><img src="docs/images/en/result.png" alt="クリーンアップ後のエージェントのレポート"><br><sub><b>結果</b> — クリーンアップ後のエージェントのレポート。残したものとその理由も示されます。</sub></td>
  </tr>
</table>

## ツール

プラグインは常駐する `pare serve` プロセス（プロトコル `pare.serve/1`、標準入出力での行区切り JSON）を起動し、次のツールを登録します。スキャンのインデックスはこのプロセス内に保持されるため、調査系ツールの前に `pare_scan` を実行してください。

| ツール | 役割 | 承認 |
|---|---|:---:|
| `pare_scan` | ドライブまたはフォルダーを読み取り専用でスキャンし、インデックスをコアプロセスに保持する | 不要 |
| `pare_scan_overview`、`pare_list_dir`、`pare_find_large_files`、`pare_same_size_files`、`pare_breakdown`、`pare_file_head`、`pare_read_text`、`pare_path_info`、`pare_installed_programs`、`pare_running_processes`、`pare_run_diagnostic` | コアが提供する読み取り専用の調査ツール。一覧はプラグイン起動時にコアへ問い合わせ（`hello`）、コアのバージョンに従って変わる | 不要 |
| `pare_read_sensitive` | Pare が機密と判定したファイル（鍵、`.env`、ブラウザーのログイン情報、資格情報ストア）の内容を読む | 必要（毎回） |
| `pare_prepare_cleanup` | 隔離するパスと、対応するアクションテンプレートを登録し、クリーンアップ ID を返す。この時点では何も変更されない | 不要 |
| `pare_execute` | 準備済みのクリーンアップを ID で実行する | 必要 |
| `pare_list_quarantine` | ローカルドライブ上の隔離バッチとその内容を一覧する | 不要 |
| `pare_undo` | 隔離バッチを元の場所へ復元する。元のパスを別のファイルが占めていても上書きしない | 必要 |
| `pare_purge` | 隔離バッチを完全に削除して空き容量を確保する。元に戻せない | 必要 |

プラグインは生のシェルコマンドを提供しません。DSH 組み込みの bash ツールには、それ自身の承認があります。

## 承認と安全性

プラグインは DSH の `tools/pre-execute` を監視し、`pare_execute`、`pare_undo`、`pare_purge`、`pare_read_sensitive` に対して `{kind: 'ask'}` を返します。DSH は自身の承認サービスを通じてユーザーに確認します。通過できるのは一度限りの `allowed-once` だけです。拒否、キャンセル、または回答できる相手がいない場合、呼び出しは拒否されます（フェイルクローズ）。確認はすべてセッションの監査ログに記録されます。

- `pare_execute` の承認プロンプトは、プラグインが保存した計画から作られ、正確なパスとテンプレートのコマンドを列挙します。モデルの説明文は使われません。
- 未知のもの、期限切れのもの、再スキャン前のクリーンアップ ID は、確認なしで拒否されます。1 つのクリーンアップ ID は最大 1 回しか実行できません。
- 実行中の呼び出しをキャンセルするとコアプロセスが停止します。次の呼び出しで新しいプロセスが起動するため、`pare_scan` をもう一度実行する必要があります。

コア側にも、ホストに依存しない独自のチェックがあります。

- 保護された場所は常に拒否されます。
- すべての項目に、`BuildSelected` が生成した根拠が付きます。
- エグゼキューターは、各ファイルを移動する直前に、ファイルの同一性、変更の有無、使用中かどうかを再確認します。
- アクションテンプレートは検証され、プレビューの digest が一致する必要があり、プレビューは 30 分で期限切れになります。
- 実行を始める前に、プレビューを使用済みとして記録します。
- `undo` と `purge` は、Pare の隔離領域内のマニフェストだけを受け付けます。

プライバシー：調査ツールは、パスとファイル名をモデル（およびそのプロバイダー）に返します。機密ファイルの内容は、読み取りのたびに承認が必要です。

## 固定されたコア

`package.json` の `pareCore` が、このプラグインのバージョンで使うコアを固定しています。バージョン 0.4.0、ダウンロード URL（GitHub `DRAG0NM/Pare` のリリース `v0.4.0` のアセット `pare-0.4.0-win-x64.exe`）、および SHA-256 `23a09ed98b24642e80c1ee83d8a7464e6fa0df2ac1a1d6e078cd5882672001fb` です。

`parePath` も `PARE_CORE_PATH` も設定されていない場合：

- プラグインは `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe` を使います（ユーザーごとにプラグインのディレクトリ外へ保存されるため、プラグインの再インストールやアップグレードで失われません）。ファイルがなければ、固定 URL からダウンロードします。まず System32 の `curl.exe`（`HTTPS_PROXY` に従う）を使い、失敗した場合は PowerShell の `Invoke-WebRequest`（Windows のシステムプロキシを使用）を使います。
- ダウンロード後に SHA-256 を検証し、一致した場合だけ保持します。一致しないダウンロードは削除されます。
- 以降は、起動のたびに、またコアプロセスを起動する前に毎回、ハッシュを再検証します。ファイルが変更されている場合、プラグインは実行を拒否し（自動では置き換えません）、エラーメッセージでファイルを削除して再ダウンロードするよう案内します。
- `hello` が返すバージョンは固定バージョンと一致する必要があります。一致しない場合、プラグインはそのコアを拒否し、調査ツールを一切登録しません。
- 環境によっては `AppData\Local` が EFS で暗号化されていて、同一ディレクトリ内のリネームが拒否されたり（EXDEV）、ウイルス対策ソフトがファイルを一時的に占有したりします。プラグインは数秒間リトライし、それでもだめなら一時ファイルをコピーして削除する方法に切り替えます。最終的なファイルも同じハッシュ検証に通る必要があります。

開発時は、`parePath` 設定または環境変数 `PARE_CORE_PATH` で自分でビルドした `pare.exe`（`go build -o pare.exe ./cmd/pare`）を指定できます。この場合ハッシュ検証は行わず、プロトコル名だけを確認します。

オフライン環境では、同じファイル（SHA-256 が一致するもの）を `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe` に置くか、`parePath` を設定してください。

`timeoutMs` は 1 回の呼び出しのタイムアウトで、既定値は 600000 ミリ秒です。

## 動作要件

- Windows。
- DeepSeek Harness `0.2.1-rc.2`（Cordis `4.0.5`）。Harness は現在も developer preview で、インターフェースが非互換に変わる可能性があります。Pare-DSH は peer バージョンを検証済みのツールインターフェースに固定しているため、アップグレード前に再テストしてください。
- Node.js 22.19 以降（DSH 自体の要件）。
- 初回起動時に、固定バージョンのコアをダウンロードするため GitHub へアクセスできること。

## ソースからのビルド

```powershell
pnpm install
pnpm check
dsh plugin --profile web add .
```

DSH 0.2.1-rc.2 で、拒否、許可、元に戻す、完全削除、および npm からのインストールを含め、エンドツーエンドで検証済みです。

## ライセンス

MIT。[LICENSE](LICENSE) を参照してください。依存関係に関する注記は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にあります。コアは [Pare](https://github.com/DRAG0NM/Pare) で、こちらも MIT ライセンスです。

## DSH 公式リソース

- [Official Harness repository and release status](https://github.com/deepseek-ai/deepseek-harness)
- [Official first-plugin guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Official tool authoring guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Official plugin packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
