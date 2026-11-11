# ヒトウマ

指を足にして画面を歩き、人間の競走馬にフォームを覚えさせるランキングゲーム。

- 遊ぶ：https://nasubi-no-oniwa.github.io/hitouma/
- 2本脚：指2本で10m調教 → 100m・200m
- 4本脚：指4本で50m調教 → 1000m・2000m（左手＝前足、右手＝後ろ足）
- 走りの計算：`sim.js`（同じフォーム・同じ距離なら結果は必ず同じ。ランキングを読むときも計算しなおして、合わない記録は出さない）
- ランキング：Firebase ft-red の `hitouma` の下（`database.rules.hitouma.json` を上げると自動で反映。鍵は `FT_RED_SERVICE_ACCOUNT`）
- 広告：結果画面だけ（なすびのお庭の決まりどおり。`?noad=1` で広告なし）
