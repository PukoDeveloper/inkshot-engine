# SpriteAnimator（`sprite-animator`）

精靈幀動畫控制器，管理角色和物件的幀動畫播放、切換與事件通知。

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
import { createEngine, SpriteAnimator, EntityManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [
    new EntityManager(),
    new SpriteAnimator(),
  ],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `sprite-animator/define` | 定義動畫集合 | 監聽 |
| `sprite-animator/play` | 播放指定動畫 | 監聽 |
| `sprite-animator/stop` | 停止動畫 | 監聽 |
| `sprite-animator/frame` | 廣播：幀更新 | 發出 |
| `sprite-animator/complete` | 廣播：動畫播放完成（非循環） | 發出 |
| `sprite-animator/state:get` | 取得動畫狀態 | 監聽 |

---

## 使用範例

### 定義動畫

```ts
// 定義英雄的動畫集合
core.events.emitSync('sprite-animator/define', {
  entityId: 'hero',
  animations: {
    idle:        { frames: [0, 1, 2, 1],       fps: 4,  loop: true },
    walk:        { frames: [3, 4, 5, 6, 7, 8], fps: 8,  loop: true },
    attack:      { frames: [9, 10, 11, 12],    fps: 12, loop: false },
    hurt:        { frames: [13, 14],            fps: 8,  loop: false },
    death:       { frames: [15, 16, 17, 18],   fps: 6,  loop: false },
  },
});
```

### 播放動畫

```ts
// 播放走路動畫
core.events.emitSync('sprite-animator/play', {
  entityId: 'hero',
  animation: 'walk',
});

// 播放攻擊動畫（完成後恢復 idle）
core.events.emitSync('sprite-animator/play', {
  entityId: 'hero',
  animation: 'attack',
});
core.events.on('myGame', 'sprite-animator/complete', ({ entityId, animation }) => {
  if (entityId === 'hero' && animation === 'attack') {
    core.events.emitSync('sprite-animator/play', { entityId: 'hero', animation: 'idle' });
  }
});
```

---

## 整合其他 Plugin

- **EntityManager**：SpriteAnimator 針對 Entity 的 sprite 組件進行控制
- **InputManager**：根據輸入狀態切換動畫
- **PlayerController**：移動時切換 walk/idle 動畫

---

## 常見模式

### 根據移動狀態切換動畫

```ts
core.events.on('myGame', 'player/move', ({ direction, speed }) => {
  const animation = speed > 0 ? 'walk' : 'idle';
  core.events.emitSync('sprite-animator/play', {
    entityId: 'hero',
    animation,
  });
});
```
