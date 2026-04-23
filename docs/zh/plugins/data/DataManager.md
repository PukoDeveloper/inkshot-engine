# DataManager（`data`）

JSON 資料集合管理，負責載入、快取、查詢結構化遊戲資料。

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
import { createEngine, DataManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new DataManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `data/load` | 載入 JSON 資料集合 | 監聽 |
| `data/get` | 取得單一資料項目 | 監聽 |
| `data/set` | 寫入/更新資料項目 | 監聽 |
| `data/query` | 查詢符合條件的資料 | 監聽 |
| `data/unload` | 卸載資料集合 | 監聽 |
| `data/loaded` | 廣播：資料集合已載入 | 發出 |

---

## 使用範例

### 載入資料集合

```ts
// 從 URL 載入 items 集合
await core.events.emit('data/load', {
  collection: 'items',
  url: '/data/items.json',
});

// 或直接傳入資料
await core.events.emit('data/load', {
  collection: 'quests',
  data: {
    'quest-001': { id: 'quest-001', title: '序章', reward: 100 },
    'quest-002': { id: 'quest-002', title: '尋找勇士', reward: 200 },
  },
});
```

### 取得資料

```ts
const { output } = core.events.emitSync('data/get', {
  collection: 'items',
  id: 'potion',
});
console.log(output.item); // { id: 'potion', name: '藥水', price: 50 }
```

### 查詢資料

```ts
const { output } = core.events.emitSync('data/query', {
  collection: 'items',
  filter: (item) => item.category === 'weapon' && item.price <= 1000,
});
console.log(output.items); // 符合條件的所有武器
```

---

## 整合其他 Plugin

- **ResourceManager**：資料 URL 的資源可透過 ResourceManager 管理
- **LocalizationManager**：資料中的文字欄位可結合 i18n
- **InventorySystem**：道具定義通常存放於 DataManager

---

## 常見模式

### 預載入所有遊戲資料

```ts
const { core } = await createEngine({
  plugins: [
    new DataManager(),
    {
      namespace: 'game-data',
      async init(c) {
        await Promise.all([
          c.events.emit('data/load', { collection: 'items', url: '/data/items.json' }),
          c.events.emit('data/load', { collection: 'enemies', url: '/data/enemies.json' }),
          c.events.emit('data/load', { collection: 'quests', url: '/data/quests.json' }),
        ]);
        console.log('所有資料載入完成');
      },
    },
  ],
});
```
