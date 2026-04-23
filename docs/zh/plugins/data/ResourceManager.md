# ResourceManager（`assets`）

資源載入與快取管理，支援圖片、音效、字型等各類資源的預載入與按需載入。

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
import { createEngine, ResourceManager } from '@inkshot/engine';

const { core } = await createEngine({
  container: '#app',
  dataRoot: '/assets/',
  plugins: [new ResourceManager()],
});
```

---

## 事件契約

| 事件 | 說明 | 方向 |
|------|------|------|
| `assets/preload` | 預載入資源包 | 監聽 |
| `assets/load` | 載入指定資源包 | 監聽 |
| `assets/get` | 同步取得已快取資源 | 監聽 |
| `assets/unload` | 卸載資源包 | 監聽 |
| `assets/progress` | 廣播：載入進度 | 發出 |
| `assets/prefetch` | 背景預取 | 監聽 |
| `assets/loaded` | 廣播：資源包載入完成 | 發出 |

---

## 使用範例

### 預載入資源包

```ts
await core.events.emit('assets/preload', {
  bundles: [
    {
      name: 'main',
      assets: {
        hero:        'images/hero.png',
        tileset:     'images/tileset.png',
        bgm:         'audio/bgm.mp3',
        attackSfx:   'audio/attack.ogg',
        mainFont:    'fonts/main.ttf',
      },
    },
  ],
});
```

### 取得已載入資源

```ts
// 同步取得 Texture
const { output } = core.events.emitSync('assets/get', { key: 'hero' });
if (output.cached) {
  const texture = output.asset as Texture;
  worldLayer.addChild(new Sprite(texture));
}
```

### 監聽載入進度

```ts
core.events.on('myGame', 'assets/progress', ({ bundle, progress, loaded, total }) => {
  loadingBar.value = progress; // 0.0 ~ 1.0
  loadingText.text = `載入中... ${loaded}/${total}`;
});
```

### 釋放資源

```ts
// 離開場景時卸載不需要的資源
await core.events.emit('assets/unload', { bundle: 'level-1' });
```

---

## 整合其他 Plugin

- **SceneManager**：每個場景的 `enter`/`exit` 分別載入/卸載所需資源
- **UIManager**：LoadingScreen 使用 `assets/progress` 顯示進度條
- **AudioManager**：音訊資源需先透過 ResourceManager 載入

---

## 常見模式

### 分批載入（按需載入）

```ts
// 啟動時只載入核心資源
await core.events.emit('assets/preload', {
  bundles: [{ name: 'core', assets: { logo: 'ui/logo.png', uiAtlas: 'ui/atlas.png' } }],
});

// 進入關卡前載入關卡資源
async function loadLevel(levelId: string) {
  await core.events.emit('assets/preload', {
    bundles: [{ name: `level-${levelId}`, assets: { ... } }],
  });
}
```
