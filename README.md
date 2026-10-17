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


## 制作ルール

- **役割分担:** Grok Bot が企画・監修（ゲームディレクター）を担当し、Antigravity CLI 上の Gemini Flash が実装します。
- **初回制作:** Grok の企画をもとに Gemini が最初の版を作り、テストで見つかった問題を直して遊べる状態にします。
- **ブラッシュアップ:** 初回制作のあと、Grok が実際に遊んで「もっと面白くする」ための指示を出します。ブラッシュアップは **最大5ラウンド** までです。
- **バグ修正:** バグ修正はラウンド数に含めず、ゲームが完成するまで何度でも続けます。
- **記録:** Gemini への指示は、初回制作からすべてのラウンドまで、各ゲームフォルダの `DIRECTION.md` に原文のまま残します。
- **公開:** 完成したら `games.json` にサムネイル付きで追加し、トップページに載せます。
