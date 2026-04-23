# DebugPlugin（`debug`）

除錯面板與日誌系統，提供遊戲執行期間的效能監控、狀態顯示與診斷工具。

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
import { createEngine, DebugPlugin } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new DebugPlugin()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `debug/log` | 記錄一般訊息 | 監聽 |
| `debug/warn` | 記錄警告訊息 | 監聽 |
| `debug/error` | 記錄錯誤訊息 | 監聽 |
| `debug/panel-toggle` | 顯示/隱藏除錯面板 | 監聽 |
| `debug/panel-add` | 新增面板顯示項目 | 監聽 |
| `debug/panel-remove` | 移除面板項目 | 監聽 |
| `debug/metric:set` | 更新效能指標 | 監聽 |

---

## 使用範例

### 基本日誌

```ts
core.events.emitSync('debug/log', {
  message: '玩家進入第一區域',
  data: { playerPos: { x: 320, y: 240 } },
});

core.events.emitSync('debug/warn', {
  message: '資源快取即將滿載',
  data: { usage: '89%' },
});

core.events.emitSync('debug/error', {
  message: '無法載入地圖資料',
  data: { url: '/data/map-01.json', status: 404 },
});
```

### 顯示除錯面板

```ts
// 切換面板顯示
core.events.emitSync('debug/panel-toggle', {});

// 新增自訂顯示項目
core.events.emitSync('debug/panel-add', {
  key: 'player-pos',
  label: '玩家座標',
  getValue: () => `(${player.x.toFixed(0)}, ${player.y.toFixed(0)})`,
});

// 更新效能指標（每幀）
core.events.on('myGame', 'core/tick', ({ delta }) => {
  core.events.emitSync('debug/metric:set', {
    key: 'fps',
    value: Math.round(60 / delta),
  });
});
```

---

## 整合其他 Plugin

- **GameStateManager**：顯示當前遊戲狀態
- **EntityManager**：監控場景中的 Entity 數量
- **PhysicsAdapter**：顯示物理碰撞框

---

## 常見模式

### 只在開發模式啟用

```ts
const plugins = [
  new ResourceManager(),
  new EntityManager(),
  // 只在開發模式加入 DebugPlugin
  ...(import.meta.env.DEV ? [new DebugPlugin()] : []),
];

const { core } = await createEngine({ plugins });
```

### 按下 F12 切換面板

```ts
core.events.on('myGame', 'input/keydown', ({ key }) => {
  if (key === 'F12') {
    core.events.emitSync('debug/panel-toggle', {});
  }
});
```
