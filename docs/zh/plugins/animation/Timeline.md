# Timeline（`timeline`）

動畫時間軸序列，讓多個補間、回呼、延遲按照精確的時序排程執行。

---

## 目錄

1. [安裝與設定](#安裝與設定)
2. [事件契約](#事件契約)
3. [使用範例](#使用範例)
4. [整合其他 Plugin](#整合其他-plugin)
5. [常見模式](#常見模式)

---

## 安裝與設定

```ts
import { createEngine, TweenManager, Timeline } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [
    new TweenManager(),
    new Timeline(),
  ],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `timeline/create` | 建立時間軸 | 監聽 |
| `timeline/start` | 開始播放時間軸 | 監聽 / 發出 |
| `timeline/step` | 每個時間點執行時廣播 | 發出 |
| `timeline/pause` | 暫停時間軸 | 監聽 |
| `timeline/resume` | 恢復時間軸 | 監聽 |
| `timeline/complete` | 時間軸播放完成 | 發出 |
| `timeline/cancel` | 取消時間軸 | 監聽 |

---

## 使用範例

### 建立入場動畫序列

```ts
const { output } = core.events.emitSync('timeline/create', {
  steps: [
    { at: 0,    action: 'tween', target: titleSprite, to: { alpha: 1 }, duration: 500 },
    { at: 500,  action: 'tween', target: subtitleSprite, to: { alpha: 1 }, duration: 300 },
    { at: 800,  action: 'callback', fn: () => showStartButton() },
    { at: 1200, action: 'tween', target: bgMusic, to: { volume: 0.8 }, duration: 1000 },
  ],
});

core.events.emitSync('timeline/start', { id: output.id });
```

### 監聽完成

```ts
core.events.on('myGame', 'timeline/complete', ({ id }) => {
  if (id === introTimelineId) {
    core.events.emitSync('game/state-change', { state: 'playing' });
  }
});
```

---

## 整合其他 Plugin

- **TweenManager**：Timeline 的 `tween` 步驟類型內部使用 TweenManager
- **AudioManager**：在時間點觸發音效播放
- **CutscenePlugin**：用 Timeline 驅動過場動畫

---

## 常見模式

### 戰鬥開始演出

```ts
core.events.emitSync('timeline/create', {
  id: 'battle-intro',
  steps: [
    { at: 0,    action: 'emit', event: 'audio/play', params: { key: 'battle-bgm', loop: true } },
    { at: 0,    action: 'tween', target: battleScene, to: { alpha: 1 }, duration: 800 },
    { at: 800,  action: 'emit', event: 'dialogue/show:text', params: { text: '戰鬥開始！' } },
    { at: 2000, action: 'emit', event: 'battle/start', params: { allies: [...], enemies: [...] } },
  ],
});
```
