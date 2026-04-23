# CutscenePlugin（`cutscene`）

過場動畫控制器，管理遊戲中的劇情演出序列。

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
import { createEngine, CutscenePlugin, DialogueManager, AudioManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [
    new AudioManager(),
    new DialogueManager(),
    new CutscenePlugin(),
  ],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `cutscene/define` | 定義過場動畫序列 | 監聽 |
| `cutscene/play` | 播放過場動畫 | 監聽 |
| `cutscene/skip` | 跳過當前過場 | 監聽 |
| `cutscene/complete` | 廣播：過場動畫完成 | 發出 |
| `cutscene/step` | 廣播：執行到某一步驟 | 發出 |
| `cutscene/pause` | 暫停過場動畫 | 監聽 |
| `cutscene/resume` | 恢復過場動畫 | 監聽 |

---

## 使用範例

### 定義過場動畫

```ts
core.events.emitSync('cutscene/define', {
  id: 'intro',
  skippable: true,
  steps: [
    { type: 'black-screen', duration: 1000 },
    { type: 'audio', action: 'play', key: 'bgm-opening', loop: true },
    { type: 'fade-in', duration: 1500 },
    { type: 'dialogue', text: '很久很久以前...' },
    { type: 'dialogue', text: '有一個古老的王國...', speaker: '旁白' },
    { type: 'wait', duration: 500 },
    { type: 'audio', action: 'fade', to: 0, duration: 1000 },
    { type: 'fade-out', duration: 1000 },
  ],
});
```

### 播放過場動畫

```ts
await core.events.emit('cutscene/play', { id: 'intro' });
console.log('過場動畫完成，進入遊戲...');
```

---

## 整合其他 Plugin

- **DialogueManager**：過場中的對話步驟
- **AudioManager**：過場中的音樂與音效控制
- **SceneManager**：過場完成後切換場景

---

## 常見模式

### 可跳過的開場動畫

```ts
core.events.on('myGame', 'input/keydown', ({ key }) => {
  if (key === 'Escape' || key === 'Enter') {
    core.events.emitSync('cutscene/skip', {});
  }
});

await core.events.emit('cutscene/play', { id: 'intro' });
await core.events.emit('scene/load', { key: 'main-menu' });
```
