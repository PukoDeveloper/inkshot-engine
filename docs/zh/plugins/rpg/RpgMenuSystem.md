# RpgMenuSystem（`rpgMenu`）

RPG 暫停選單狀態機。

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
import { createEngine } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [/* RpgMenuSystem（`rpgMenu`） */],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `rpgMenu/open` | rpgMenu/open 操作 | 監聽 / 發出 |
| `rpgMenu/close` | rpgMenu/close 操作 | 監聽 / 發出 |
| `rpgMenu/navigate` | rpgMenu/navigate 操作 | 監聽 / 發出 |
| `rpgMenu/select` | rpgMenu/select 操作 | 監聽 / 發出 |

---

## 使用範例

```ts
// 使用 RpgMenuSystem（`rpgMenu`）
// 透過 core.events.emit / emitSync 呼叫上述事件
```

---

## 整合其他 Plugin

請參閱 [RPG 系統總覽](../../rpg/README.md) 與 [核心概念](../../core-concepts.md) 了解整合方式。

---

## 常見模式

請參閱 [快速入門](../../getting-started.md) 與各相關 Plugin 文件取得完整範例。
