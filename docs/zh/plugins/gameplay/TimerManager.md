# TimerManager（`timer`）

計時器與冷卻管理，提供精確的遊戲內時間控制。

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
import { createEngine, TimerManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new TimerManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `timer/start` | 建立並啟動計時器 | 監聽 |
| `timer/stop` | 停止計時器 | 監聽 |
| `timer/pause` | 暫停計時器 | 監聽 |
| `timer/resume` | 恢復計時器 | 監聽 |
| `timer/tick` | 廣播：計時器每幀更新 | 發出 |
| `timer/complete` | 廣播：計時器結束 | 發出 |
| `timer/cooldown-start` | 啟動冷卻計時 | 監聽 |
| `timer/cooldown-end` | 廣播：冷卻結束 | 發出 |
| `timer/cooldown:get` | 查詢冷卻剩餘時間 | 監聽 |

---

## 使用範例

### 倒數計時器

```ts
const { output } = core.events.emitSync('timer/start', {
  id: 'stage-timer',
  duration: 60000,
  countdown: true,
});

core.events.on('myGame', 'timer/tick', ({ id, remaining, elapsed }) => {
  if (id === 'stage-timer') {
    timerDisplay.text = `${Math.ceil(remaining / 1000)}秒`;
  }
});

core.events.on('myGame', 'timer/complete', ({ id }) => {
  if (id === 'stage-timer') {
    core.events.emitSync('game/state-change', { state: 'game-over' });
  }
});
```

### 技能冷卻

```ts
core.events.emitSync('timer/cooldown-start', {
  id: 'skill-fireball',
  duration: 3000,
});

const { output } = core.events.emitSync('timer/cooldown:get', {
  id: 'skill-fireball',
});
if (!output.active) {
  castFireball();
}

core.events.on('myGame', 'timer/cooldown-end', ({ id }) => {
  if (id === 'skill-fireball') {
    skillButton.enable();
  }
});
```

---

## 整合其他 Plugin

- **GameStateManager**：暫停遊戲時自動暫停所有計時器
- **BattleSystem**：回合計時
- **UIManager**：顯示倒數 UI

---

## 常見模式

### 重複計時器（Interval）

```ts
core.events.emitSync('timer/start', {
  id: 'enemy-spawn',
  duration: 5000,
  repeat: true,
});

core.events.on('myGame', 'timer/complete', ({ id }) => {
  if (id === 'enemy-spawn') {
    spawnRandomEnemy();
  }
});
```
