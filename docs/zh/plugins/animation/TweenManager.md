# TweenManager（`tween`）

屬性補間動畫驅動器，讓任何物件的數值屬性在指定時間內平滑過渡。

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
import { createEngine, TweenManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new TweenManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `tween/create` | 建立補間動畫 | 監聽 |
| `tween/update` | 每幀更新補間進度（內部） | 發出 |
| `tween/complete` | 補間動畫完成時廣播 | 發出 |
| `tween/cancel` | 取消指定補間 | 監聽 |
| `tween/pause` | 暫停補間 | 監聽 |
| `tween/resume` | 恢復補間 | 監聽 |

---

## 使用範例

### 基本補間

```ts
// 將精靈的 x 在 1 秒內移動到 500
const { output } = core.events.emitSync('tween/create', {
  target: sprite,
  to: { x: 500 },
  duration: 1000,       // 毫秒
  ease: 'easeOutQuad',  // 緩動函式
});
const tweenId = output.id;

// 監聽完成
core.events.on('myGame', 'tween/complete', ({ id }) => {
  if (id === tweenId) console.log('移動完成！');
});
```

### 鏈式動畫

```ts
// 完成後繼續下一個補間
core.events.on('myGame', 'tween/complete', async ({ id }) => {
  if (id === moveTweenId) {
    core.events.emitSync('tween/create', {
      target: sprite,
      to: { alpha: 0 },
      duration: 500,
    });
  }
});
```

### 取消補間

```ts
core.events.emitSync('tween/cancel', { id: tweenId });
```

---

## 整合其他 Plugin

- **EntityManager**：補間 entity 的位置、縮放、旋轉等屬性
- **UIManager**：製作 UI 元件出現/消失動畫
- **Timeline**：使用 Timeline 將多個補間排程為序列

---

## 常見模式

### 彈跳效果

```ts
core.events.emitSync('tween/create', {
  target: sprite,
  to: { y: sprite.y - 50 },
  duration: 300,
  ease: 'easeOutBounce',
  yoyo: true,  // 來回播放
});
```

### 循環動畫

```ts
core.events.emitSync('tween/create', {
  target: sprite,
  to: { rotation: Math.PI * 2 },
  duration: 2000,
  repeat: Infinity,  // 無限循環
  ease: 'linear',
});
```
