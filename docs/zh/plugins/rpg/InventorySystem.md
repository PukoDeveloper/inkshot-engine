# InventorySystem（`inventory`）

角色背包與裝備系統。

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
  plugins: [/* InventorySystem（`inventory`） */],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `inventory/item:define` | inventory/item:define 操作 | 監聽 / 發出 |
| `inventory/item:add` | inventory/item:add 操作 | 監聽 / 發出 |
| `inventory/item:remove` | inventory/item:remove 操作 | 監聽 / 發出 |
| `inventory/item:use` | inventory/item:use 操作 | 監聽 / 發出 |
| `inventory/item:equip` | inventory/item:equip 操作 | 監聽 / 發出 |
| `inventory/item:unequip` | inventory/item:unequip 操作 | 監聽 / 發出 |
| `inventory/list:get` | inventory/list:get 操作 | 監聽 / 發出 |

---

## 使用範例

```ts
// 使用 InventorySystem（`inventory`）
// 透過 core.events.emit / emitSync 呼叫上述事件
```

---

## 整合其他 Plugin

請參閱 [RPG 系統總覽](../../rpg/README.md) 與 [核心概念](../../core-concepts.md) 了解整合方式。

---

## 常見模式

請參閱 [快速入門](../../getting-started.md) 與各相關 Plugin 文件取得完整範例。
