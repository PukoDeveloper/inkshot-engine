# EntityManager（`entity`）

實體組件系統（ECS），管理遊戲世界中所有的物件（Entity）及其資料（Component）。

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
import { createEngine, EntityManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new EntityManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `entity/create` | 建立新 Entity | 監聽 |
| `entity/destroy` | 銷毀 Entity | 監聽 |
| `entity/get` | 取得 Entity | 監聽 |
| `entity/query` | 依標籤或組件查詢 Entity | 監聽 |
| `entity/update` | 更新 Entity 資料 | 監聽 |
| `entity/component-add` | 為 Entity 加入組件 | 監聽 |
| `entity/component-remove` | 移除組件 | 監聽 |
| `entity/component-get` | 取得組件資料 | 監聽 |
| `entity/tag:set` | 設定 Entity 標籤 | 監聽 |
| `entity/created` | 廣播：Entity 已建立 | 發出 |
| `entity/destroyed` | 廣播：Entity 已銷毀 | 發出 |

---

## 使用範例

### 建立 Entity

```ts
// 建立玩家 Entity
const { output } = core.events.emitSync('entity/create', {
  id: 'hero',    // 可選，不指定則自動生成
  tags: ['player', 'actor'],
  components: {
    position: { x: 100, y: 200 },
    velocity: { vx: 0, vy: 0 },
    sprite:   { key: 'hero', anchor: { x: 0.5, y: 1.0 } },
  },
});
const heroId = output.id;
```

### 查詢 Entity

```ts
// 查詢所有敵人
const { output } = core.events.emitSync('entity/query', {
  tags: ['enemy'],
});
console.log(output.entities); // Entity 陣列

// 查詢帶有特定組件的 Entity
const { output: players } = core.events.emitSync('entity/query', {
  hasComponents: ['position', 'velocity'],
  tags: ['player'],
});
```

### 讀寫組件

```ts
// 取得組件
const { output } = core.events.emitSync('entity/component-get', {
  id: heroId,
  component: 'position',
});
console.log(output.data); // { x: 100, y: 200 }

// 更新組件
core.events.emitSync('entity/component-add', {
  id: heroId,
  component: 'position',
  data: { x: 150, y: 200 },
});
```

---

## 整合其他 Plugin

- **KinematicPhysicsAdapter**：物理系統讀取/更新 Entity 的 position 和 velocity
- **SpriteAnimator**：動畫系統控制 Entity 的 sprite 組件
- **PlayerController**：玩家控制器尋找帶有 `player` 標籤的 Entity

---

## 常見模式

### 每幀更新所有敵人 AI

```ts
core.events.on('myGame', 'core/tick', ({ delta }) => {
  const { output } = core.events.emitSync('entity/query', { tags: ['enemy'] });
  for (const entity of output.entities) {
    updateEnemyAI(entity, delta);
  }
});
```
