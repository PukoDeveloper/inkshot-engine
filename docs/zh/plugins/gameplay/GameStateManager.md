# GameStateManager（`game`）

高階遊戲狀態機，管理遊戲的整體狀態（主選單、遊戲中、暫停、戰鬥等）。

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
import { createEngine, GameStateManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new GameStateManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `game/start` | 開始遊戲 | 監聽 |
| `game/stop` | 停止遊戲 | 監聽 |
| `game/pause` | 暫停遊戲 | 監聽 |
| `game/resume` | 恢復遊戲 | 監聽 |
| `game/tick` | 遊戲更新幀（只有在 playing 狀態下才發出） | 發出 |
| `game/state-change` | 切換遊戲狀態 | 監聽 |
| `game/state:get` | 取得當前狀態 | 監聽 |
| `game/state-changed` | 廣播：狀態已切換 | 發出 |

---

## 使用範例

### 狀態切換

```ts
core.events.emitSync('game/state-change', { state: 'playing' });
core.events.emitSync('game/state-change', { state: 'paused' });
core.events.emitSync('game/state-change', { state: 'battle' });

const { output } = core.events.emitSync('game/state:get', {});
console.log(output.state); // 'battle'
```

### 監聽狀態變化

```ts
core.events.on('myGame', 'game/state-changed', ({ from, to }) => {
  console.log(`遊戲狀態：${from} → ${to}`);
  if (to === 'paused') {
    showPauseMenu();
  } else if (from === 'paused' && to === 'playing') {
    hidePauseMenu();
  }
});
```

---

## 整合其他 Plugin

- **SceneManager**：狀態變更通常伴隨場景切換
- **InputManager**：不同狀態下接受不同的輸入
- **AudioManager**：不同狀態使用不同的 BGM

---

## 常見模式

### 暫停選單整合

```ts
core.events.on('myGame', 'input/keydown', ({ key }) => {
  const { output } = core.events.emitSync('game/state:get', {});
  if (key === 'Escape') {
    if (output.state === 'playing') {
      core.events.emitSync('game/state-change', { state: 'paused' });
    } else if (output.state === 'paused') {
      core.events.emitSync('game/state-change', { state: 'playing' });
    }
  }
});
```
