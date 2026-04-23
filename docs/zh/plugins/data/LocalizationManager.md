# LocalizationManager（`i18n`）

多語言本地化管理，支援語系載入、動態切換、插值替換。

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
import { createEngine, LocalizationManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new LocalizationManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `i18n/load` | 載入語系資料 | 監聽 |
| `i18n/set-locale` | 切換當前語系 | 監聽 |
| `i18n/translate` | 翻譯指定 key | 監聽 |
| `i18n/locale-change` | 廣播：語系已切換 | 發出 |
| `i18n/locale:get` | 取得當前語系 | 監聽 |

---

## 使用範例

### 載入語系

```ts
// 繁體中文
await core.events.emit('i18n/load', {
  locale: 'zh-TW',
  url: '/i18n/zh-TW.json',
});

// 英文
await core.events.emit('i18n/load', {
  locale: 'en',
  url: '/i18n/en.json',
});

// 設定預設語系
await core.events.emit('i18n/set-locale', { locale: 'zh-TW' });
```

### 翻譯文字

```ts
const { output } = core.events.emitSync('i18n/translate', {
  key: 'ui.start-button',
});
console.log(output.text); // '開始遊戲'

// 含插值
const { output: msg } = core.events.emitSync('i18n/translate', {
  key: 'battle.damage-taken',
  vars: { amount: 42, actor: '勇者' },
});
// key 對應："{actor} 受到了 {amount} 點傷害"
// 輸出：'勇者 受到了 42 點傷害'
```

### 監聽語系切換

```ts
core.events.on('myGame', 'i18n/locale-change', ({ locale }) => {
  console.log(`語系已切換為：${locale}`);
  refreshAllUITexts(); // 重新渲染所有 UI 文字
});
```

---

## 整合其他 Plugin

- **DialogueManager**：對話文字自動透過 i18n 翻譯
- **UIManager**：UI 文字元件使用 i18n key
- **SettingsManager**：將語系偏好持久化

---

## 常見模式

### 語系 JSON 格式

```json
{
  "ui.start-button": "開始遊戲",
  "ui.continue-button": "繼續",
  "battle.damage-taken": "{actor} 受到了 {amount} 點傷害",
  "battle.level-up": "{actor} 升級了！現在是 {level} 級",
  "item.potion.name": "藥水",
  "item.potion.desc": "恢復 50 HP"
}
```
