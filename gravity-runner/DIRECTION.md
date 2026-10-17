# 重力反転ランナー ディレクション記録

Grok Bot（ゲームディレクター）が Gemini 3.8 Flash（Antigravity CLI）に送った指示を、各回そのまま記録します。

## 初回制作

### 初回制作 第1回：初版の実装（原文）

**狙い:** ふんわり重力反転＋着地までのクールタイムという核の手触りを、HTML1ファイルで遊べる形にする。

```
Create a single self-contained file index.html in the current directory (canvas + vanilla JS, no external assets/fonts/libs). Browser mini-game "重力反転ランナー" (Japanese UI text).
- Responsive full-window canvas, works on mobile tap (touchstart/pointerdown, preventDefault) and desktop click / Space key.
- A stick figure runs automatically with animated legs and arms along the floor; obstacles scroll toward it from the right. Endless runner; speed ramps up so a run lasts at most a few minutes.
- Tap = flip gravity (floor <-> ceiling). The change is soft/floaty: gravity acceleration is gentle so the figure drifts and accelerates gradually to the other side; the figure smoothly rotates 180deg to be upside down while in transit.
- Cooldown: cannot flip again until landed. Show a subtle indicator of flip availability (e.g. small arrow/dot near the figure or HUD that dims when unavailable).
- Obstacles on both floor and ceiling (spikes/blocks of varying height), plus patterns/combos that require timing the slow transit (e.g. floor block followed shortly by ceiling block). Ensure every pattern is passable.
- Collision (AABB with slightly forgiving hitbox) = game over. Score = distance (m). Best score saved in localStorage. Game over screen shows score and best, tap to retry. Title screen 「重力反転ランナー」 with 「タップでスタート」 and brief instructions.
- Simple clean minimal look (light background, dark lines, one accent color). Use requestAnimationFrame with delta time clamped. No console errors.
Expose window.__game = {state, score} for testing.
```

### 初回制作 第2回：バグ修正（要約・原文は残っていないため再構成）

**狙い:** 初版テストで見つかった遊びにくさ4点の修正。

```
（要約）初版のテストで以下4点が見つかったので修正してください。
1. スマホ縦持ち時に先が見えない: 縦持ちでも前方を最低800ゲームpx見渡せるようにスケーリングする。
2. 序盤が難しい: 開始後2秒間は障害物を出さず、最初の数個はやさしい障害物にする。
3. ゲームオーバー直後のタップで即リトライしてしまう: ゲームオーバー後0.6秒は入力を受け付けない。
4. 着地直前のタップが無視される: 着地前0.12秒以内の入力をバッファし、着地した瞬間に反転させる。
```

## ブラッシュアップ第1回（2026-10-17）

**狙い:** 初版は「避けるだけ」で、反転する理由が障害物回避しかない。空中にご褒美（コイン）を置いて積極的に反転させ、ニアミス・コンボでリスクを取るほど得をする構造にする。加えて手触り（ジュース）と速度ティアで、上達と緊張感の高まりを感じさせる。

```
あなたは実装担当です。Grok（ゲームディレクター）からの指示で gravity-runner/index.html（このフォルダの index.html）の「遊んで楽しい」度を上げてください。外部依存なし・1ファイルのまま。既存の操作（タップ/クリック/スペースで重力ふんわり反転、着地までクールタイム、着地直前の入力バッファ）と window.__game テスト用オブジェクトは維持・拡張してください。
ブラッシュアップ第1回の指示:
1. スコア再設計: 距離(m)に加えて「スコア」を導入。表示は大きくスコア、小さく距離。
2. コイン: 天井と床の間（空中の軌道上）に、反転中にしか取れない弧状のコイン列を障害物パターンと連動して配置。取得で+10×倍率、キラッとしたパーティクルと短い効果音。
3. ニアミスボーナス: 障害物すれすれ（数px以内）を通過したら「NEAR MISS!」のポップアップ＋スコア加算。
4. コンボ倍率: 着地せずにコインを連続取得、またはニアミスが連続するとコンボ増加、倍率 x1→x2→x3→x5（最大）。被弾なしで一定時間経過で減らない、着地後2秒以内に次の得点がないとリセット。HUDに倍率表示。
5. ジュース: 着地時のスクワッシュ&ストレッチ、反転開始時の小さい画面シェイクとトレイル、死亡時に強めのシェイク＋ヒットストップ(80ms程度)。
6. 速度ティア: 速度に応じて3〜4段階（例: 0/400/900/1500m）。ティアが上がると「SPEED UP!」表示、背景色/アクセント色が変化、BGM（WebAudioの簡単なループ、ミュートボタン連動）のテンポを上げる。
7. 障害物の多様化: 上下から動く（上下に往復する）ハザード、天井と床の両方に交互に並ぶジグザグ、狭いトンネル（反転のタイミングが要る）を中盤以降に追加。必ず通過可能であること。
8. ゲームオーバー画面: スコア、距離、取得コイン数、最大コンボ、ニアミス回数、ベスト更新なら「NEW BEST!」。ベストはスコアで保存（旧キーと互換に注意）。
9. モバイル: 横持ちで画面いっぱいに表示、縦持ちでは見える距離を確保しつつ「横持ち推奨」を控えめに表示。
コンソールエラーが出ないこと。git commit/push はしないでください。最後に変更点を簡潔にまとめて。
```

## バグ修正（ブラッシュアップ第1回のあと）

**狙い:** 第1回のプレイテスト（デスクトップ/スマホ横/縦のヘッドレス確認）で見つかった、404エラー・HUDの重なり・縦持ち時の文字サイズの崩れを直す。

```
gravity-runner/index.html（このフォルダの index.html）のバグ修正をしてください。新機能は追加しないでください。
1. ページ読み込み時にコンソールに「Failed to load resource: 404」が1〜2件出ます。favicon（inline SVG data URI の <link rel="icon"> を追加）や、存在しないファイルへの参照（音声・画像など）がないか確認し、404を0件にしてください。
2. デスクトップ幅(960x540)で左上HUDの「BEST xxx」の文字がトラック上端の線に重なっています。重ならないよう余白を調整してください。
3. スマホ縦持ち(390x844)で、スコア・倍率・速度などのHUD文字が極端に小さく読めない一方、ミュートボタンだけ大きすぎます。HUDはゲームキャンバスのスケールに関係なく画面幅に応じた読める大きさ（最低12px相当）にし、ミュートボタンは他の要素と釣り合うサイズにしてください。トラック上下の大きな余白にHUDを配置しても構いません。
4. 「横持ち推奨」バッジが浮遊中インジケーターと重なり気味なので位置を整理してください。
コンソールエラー0件、window.__game は維持。git commit/push はしないでください。最後に変更点を簡潔にまとめて。
```
