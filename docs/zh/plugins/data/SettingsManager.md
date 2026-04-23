# SettingsManager（`settings`）

遊戲設定管理，提供持久化的遊戲選項儲存（音量、語系、鍵位等）。

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
import { createEngine, SettingsManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [new SettingsManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `settings/get` | 取得設定值 | 監聽 |
| `settings/set` | 設定/更新設定值 | 監聽 |
| `settings/save` | 持久化儲存所有設定 | 監聽 |
| `settings/load` | 從持久化儲存載入設定 | 監聽 |
| `settings/reset` | 重置為預設值 | 監聽 |
| `settings/changed` | 廣播：設定已變更 | 發出 |

---

## 使用範例

### 讀寫設定

```ts
// 設定音量
core.events.emitSync('settings/set', {
  key: 'audio.bgmVolume',
  value: 0.7,
});

// 讀取設定
const { output } = core.events.emitSync('settings/get', {
  key: 'audio.bgmVolume',
  default: 0.8, // 預設值（若設定不存在時使用）
});
console.log(output.value); // 0.7
```

### 儲存與載入

```ts
// 遊戲啟動時載入設定
await core.events.emit('settings/load');

// 設定變更後儲存
core.events.on('myGame', 'settings/changed', () => {
  core.events.emitSync('settings/save');
});
```

### 重置設定

```ts
// 重置所有設定到預設值
core.events.emitSync('settings/reset', {});
```

---

## 整合其他 Plugin

- **AudioManager**：從 SettingsManager 讀取音量設定
- **LocalizationManager**：從 SettingsManager 讀取語系偏好
- **InputManager**：從 SettingsManager 讀取自訂鍵位設定

---

## 常見模式

### 遊戲啟動初始化設定

```ts
{
  namespace: 'game-init',
  dependencies: ['settings', 'audio', 'i18n'],
  async init(core) {
    // 載入持久化設定
    await core.events.emit('settings/load');

    // 應用音量設定
    const { output: vol } = core.events.emitSync('settings/get', {
      key: 'audio.bgmVolume', default: 0.8,
    });
    core.events.emitSync('audio/volume', { channel: 'bgm', value: vol.value });

    // 應用語系設定
    const { output: lang } = core.events.emitSync('settings/get', {
      key: 'language', default: 'zh-TW',
    });
    await core.events.emit('i18n/set-locale', { locale: lang.value });
  },
}
```
