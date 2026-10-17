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
