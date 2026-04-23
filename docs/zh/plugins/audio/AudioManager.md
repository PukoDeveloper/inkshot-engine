# AudioManager（`audio`）

音效與背景音樂管理，支援空間音效、音量控制、淡入淡出。

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
import { createEngine, AudioManager, ResourceManager } from '@inkshot/engine';

const { core } = await createEngine({
  plugins: [
    new ResourceManager(),
    new AudioManager(),
  ],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `audio/play` | 播放音效或音樂 | 監聽 |
| `audio/stop` | 停止播放 | 監聽 |
| `audio/pause` | 暫停播放 | 監聽 |
| `audio/resume` | 恢復播放 | 監聽 |
| `audio/volume` | 設定音量 | 監聽 |
| `audio/mute` | 靜音/取消靜音 | 監聽 |
| `audio/played` | 廣播：音效已開始播放 | 發出 |
| `audio/stopped` | 廣播：音效已停止 | 發出 |
| `audio/fade` | 淡入/淡出音量 | 監聽 |

---

## 使用範例

### 播放背景音樂

```ts
// 先預載資源
await core.events.emit('assets/preload', {
  bundles: [{ name: 'audio', assets: { bgm: 'audio/town.mp3' } }],
});

// 播放背景音樂（循環）
const { output } = core.events.emitSync('audio/play', {
  key: 'bgm',
  loop: true,
  volume: 0.6,
  channel: 'bgm',  // 可選：音軌分組
});
console.log(output.instanceId); // 用於後續控制
```

### 播放音效

```ts
core.events.emitSync('audio/play', {
  key: 'sfx-attack',
  volume: 1.0,
  channel: 'sfx',
});
```

### 淡入淡出

```ts
// 淡出當前 BGM
await core.events.emit('audio/fade', {
  instanceId: bgmInstanceId,
  to: 0,
  duration: 1000,
});

// 切換後淡入新 BGM
core.events.emitSync('audio/play', { key: 'bgm-battle', loop: true, volume: 0 });
await core.events.emit('audio/fade', {
  channel: 'bgm',
  to: 0.8,
  duration: 1000,
});
```

### 音量控制

```ts
// 設定主音量
core.events.emitSync('audio/volume', { channel: 'master', value: 0.7 });

// 靜音所有音效
core.events.emitSync('audio/mute', { channel: 'sfx', muted: true });
```

---

## 整合其他 Plugin

- **ResourceManager**：音訊資源需先透過 ResourceManager 預載
- **SettingsManager**：將音量設定持久化儲存
- **SceneManager**：切換場景時停止/切換 BGM

---

## 常見模式

### 場景切換時交叉淡化 BGM

```ts
core.events.on('myGame', 'scene/changed', async ({ from, to }) => {
  const bgmMap = { 'town': 'bgm-town', 'dungeon': 'bgm-dungeon' };
  const newBgm = bgmMap[to];
  if (newBgm) {
    await core.events.emit('audio/fade', { channel: 'bgm', to: 0, duration: 500 });
    core.events.emitSync('audio/stop', { channel: 'bgm' });
    core.events.emitSync('audio/play', { key: newBgm, loop: true, volume: 0 });
    await core.events.emit('audio/fade', { channel: 'bgm', to: 0.7, duration: 500 });
  }
});
```
