# 積み上げタワー ディレクション記録

Grok Bot（ゲームディレクター）が Gemini 3.8 Flash（Antigravity CLI）に送った指示を、各回そのまま記録します。

## 初回制作

### 初回制作：初版の実装（原文）

**狙い:** 縦持ち・親指1本で遊べる「タップで落として積む」核の手触りを1ファイルで作る。はみ出しカットで塔が細くなる緊張感と、PERFECTでの幅回復による逆転の芽を最初から入れる。テスト用に `?bot=1` の自動プレイも用意する。

```
Create a single self-contained file stack-tower/index.html (relative to the current directory; canvas + vanilla JS, no external assets/fonts/libs/network requests; include an inline SVG data-URI favicon so there are no 404s). Browser mini-game 「積み上げタワー」 with Japanese UI text. Do not touch any other folder. Do not git commit/push.
Design target: PORTRAIT smartphone, played with one thumb (390x844 is the main test size). Must also work on desktop (click / Space key) and landscape (center a portrait play column, letterbox the sides).
Core:
- Responsive full-window canvas with devicePixelRatio handling. Input: pointerdown/touchstart anywhere (preventDefault, no double-fire, no scroll/zoom), click, Space.
- A tower of blocks seen from the side (simple clean 2.5D or flat look, pleasant gradient sky that slowly shifts color as height increases, block colors cycle by hue per level).
- The current block slides left/right above the top of the tower (ping-pong across the play width, speed slowly increases with height). Tap = drop it. The part overhanging the block below is cut off and falls away with rotation and gravity (physics-ish debris that fades); the remaining part stays, so the tower gets narrower.
- Perfect alignment (within a few px tolerance) = PERFECT: snap exactly, flash/ring effect, combo counter +1, and from combo 3+ each perfect regrows the width a little (capped at original width). Non-perfect resets combo.
- Camera smoothly scrolls up as the tower grows, so the active block is always in the upper-middle area and the thumb never covers it.
- Miss completely (no overlap) = the block falls, game over.
- Score = height (number of placed blocks); perfect bonus can be shown separately but primary score is height. Best score saved in localStorage (key 'stackTowerBest'). HUD: large current score top center, small best.
- Title screen: 「積み上げタワー」, 「タップでスタート」, one-line instructions. Game over screen: score, best, NEW BEST! if beaten, 「タップでリトライ」, ignore input for 0.6s after game over.
- Short WebAudio beeps (drop, perfect with rising pitch per combo, game over), with a small mute toggle (persist in localStorage). Audio context created on first gesture.
- requestAnimationFrame with clamped delta time. No console errors.
- Testing hooks: expose window.__game = {state:'title'|'play'|'over', score, best, combo, width} kept up to date. If the URL has ?bot=1, an autopilot plays: it taps when the moving block is nearly aligned with the tower top (with small random error so it sometimes gets non-perfect), starting automatically from title and retrying after game over.
At the end, briefly summarize what you built.
```

テスト結果（390×844 縦／960×600 PC／844×390 横）: コンソールエラー0、手動タップ・自動プレイともに動作。初版で修正が必要な不具合はなかったため、初回制作のバグ修正ラウンドはなし（自動プレイが失敗しにくい点は第1回で調整）。

## ブラッシュアップ第1回（2026-10-18）

**狙い:** 初版は「落とす→切れる」だけで、うまく置けた手応えの差が小さい。ズレ量に応じた4段階判定・コンボ・ポイントで上手さが報われる構造にし、手触り（バウンド・シェイク・振動）と難度カーブ・高度ごとの空の変化で、積むほど緊張感と達成感が増すようにする。

```
あなたは実装担当です。Grok（ゲームディレクター）からの指示で stack-tower/index.html の「遊んで楽しい」度を上げてください。外部依存なし・1ファイルのまま、他のフォルダは触らないでください。既存の操作（タップ/クリック/スペースで落とす）、縦持ち優先レイアウト、localStorage キー、window.__game と ?bot=1 は維持・拡張してください。
ブラッシュアップ第1回の指示（手触りと判定の気持ちよさ）:
1. 判定の段階化: ズレ量に応じて PERFECT / GREAT / GOOD / ギリギリ! の4段階の文字をブロック上にポップ表示（色分け）。PERFECT はスナップ＋リング＋白フラッシュ、ギリギリ（残り幅がかなり細い）は赤く脈打つ演出で緊張感を出す。
2. コンボ: PERFECT 連続でコンボ数を大きく表示し、効果音の音程が段階的に上がる。コンボ3以上の PERFECT で幅が少し回復する時は「幅UP!」と両端が伸びるアニメーション。コンボが途切れた時は小さく「コンボ終了」。
3. スコア: 主スコアは高さ(段)のまま、別に「ポイント」を導入（1段=10pt、PERFECT=+25×コンボ、GREAT=+15）。HUD は大きく段数、その下に小さくポイント。ベストは段数で保存（既存キー互換）。
4. ジュース: 着地時にタワー全体が軽くバウンド、切り落とし片は切断面側に回転しながら落下して画面外へ、小さな画面シェイク、PERFECT時にスマホなら navigator.vibrate(15)（存在チェックして安全に）。
5. 難しさのカーブ: ブロック速度は段数で滑らかに上がる（最初の10段はやさしく、30段付近で明確に速く）。10段ごとに「10段到達!」のマイルストーン表示と空の色の段階変化（地上→雲の上→夕焼け→夜→宇宙）。
6. 自動プレイ(?bot=1)の調整: 現状は失敗しないので、ズレの大きさをたまに大きくして、だいたい20〜60段で失敗してゲームオーバーになるようにする（テスト用）。
コンソールエラーが出ないこと。git commit/push はしないでください。最後に変更点を簡潔にまとめて。
```

## バグ修正（ブラッシュアップ第1回のあと）

**狙い:** 第1回のヘッドレス確認（390×844縦ほか）で見つかった、タイトル文字の読みにくさ・ポップアップの重なり・自動プレイが失敗しない問題を直す。

```
stack-tower/index.html のバグ修正をしてください。新機能は追加しないでください。他のフォルダは触らない、git commit/push はしない。
1. タイトル画面の文字が明るい空（地上の水色）の上で読みにくい: 「▶ タップでスタート」と説明文・[Space]の案内が白で背景に溶けている。文字に濃い影/縁取りか半透明の暗い帯を付けて、どの空の色でもはっきり読めるようにする（390x844 縦で確認）。
2. ポップアップの重なり: 「コンボ終了」「+25 pt」「GREAT!」が同じ位置に小さく重なって読めない。また「幅UP!」と「PERFECT! x4」が重なる。判定文字を主役として大きく1つ、ポイントはその下、「幅UP!」「コンボ終了」はさらに下に縦に並べて重ならないようにし、新しいポップアップが出たら古い同種のものは消す。
3. 自動プレイ(?bot=1)が縦持ち390x844で40秒以上失敗しない（36段でもゲームオーバーにならない）。前回の指示どおり、だいたい20〜60段で失敗するように、段数が上がるほど大きくズレる確率を上げる（テスト用なので最終的に必ず失敗するように）。
コンソールエラーが出ないこと。最後に修正点を簡潔にまとめて。
```

結果: タイトル文字は暗い帯付きで読めるように、判定→ポイント→幅UP/コンボ終了が縦に並んで重ならなくなり、自動プレイは30〜35段でゲームオーバーになるように。エラー0。
