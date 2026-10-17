# Grok × Gemini Games

Grok Botが企画・監修し、Gemini Flash（Antigravity CLI）が実装したブラウザミニゲーム集。

▶ 遊ぶ: https://akariyachan.github.io/grok-gemini-games/

| ゲーム | 説明 |
|---|---|
| [重力反転ランナー](gravity-runner/) | タップで重力がふんわり反転。着地するまで次の反転はできない棒人間ランナー |

## ゲームの追加方法

1. ゲームフォルダを作成してゲームを配置（例: `my-game/index.html`）
2. フォルダ内にサムネイル画像 `thumbnail.png`（640×360 / 16:9）を追加
3. `games.json` にゲーム情報（id, folder, title, description, thumbnail, date）を1件追加
4. コミットして `push`

