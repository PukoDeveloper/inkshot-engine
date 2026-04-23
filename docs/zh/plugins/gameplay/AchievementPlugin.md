# AchievementPlugin（`achievement`）

成就系統，追蹤玩家進度並在達成條件時解鎖成就。

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
import { createEngine, AchievementPlugin } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new AchievementPlugin()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `achievement/define` | 定義成就 | 監聽 |
| `achievement/unlock` | 解鎖成就 | 監聽 |
| `achievement/progress` | 更新成就進度 | 監聽 |
| `achievement/get` | 取得成就狀態 | 監聽 |
| `achievement/list` | 列出所有成就 | 監聽 |
| `achievement/unlocked` | 廣播：成就已解鎖 | 發出 |

---

## 使用範例

### 定義成就

```ts
core.events.emitSync('achievement/define', {
  id: 'first-battle',
  title: '初出茅廬',
  description: '完成第一場戰鬥',
  type: 'boolean',
});

core.events.emitSync('achievement/define', {
  id: 'kill-100',
  title: '百戰老將',
  description: '擊敗 100 個敵人',
  type: 'progress',
  target: 100,
});
```

### 解鎖成就

```ts
core.events.emitSync('achievement/unlock', { id: 'first-battle' });

core.events.emitSync('achievement/progress', {
  id: 'kill-100',
  increment: 1,
});
```

### 監聽解鎖事件

```ts
core.events.on('myGame', 'achievement/unlocked', ({ id, title }) => {
  showAchievementToast(`🏆 成就解鎖：${title}`);
});
```

---

## 整合其他 Plugin

- **SaveManager**：成就進度與解鎖狀態需持久化儲存
- **UIManager**：顯示成就解鎖通知
- **VariableStoreManager**：從遊戲變數觸發成就條件

---

## 常見模式

### 戰鬥結束後更新成就

```ts
core.events.on('myGame', 'battle/ended', ({ outcome, enemies }) => {
  if (outcome === 'victory') {
    core.events.emitSync('achievement/unlock', { id: 'first-battle' });
    core.events.emitSync('achievement/progress', {
      id: 'kill-100',
      increment: enemies.length,
    });
  }
});
```
