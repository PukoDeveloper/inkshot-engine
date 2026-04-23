# 瀏覽器直接執行（Browser Bundle）

本文件說明如何在**不安裝 Node.js**的情況下，於瀏覽器中直接使用 Inkshot Engine 及其插件。

---

## 背景

`@inkshot/engine` 以 NPM 套件形式發布，供開發者在有 Node.js 環境的工作流程中使用。然而，
**編輯器或終端用戶不應假設對方安裝了 Node.js**。

為此，我們提供：

| 檔案 | 說明 |
|------|------|
| `dist/engine.bundle.js` | 引擎 + pixi.js 合併打包的 ESM 檔案（`npm run build:bundle` 產生） |
| `editor/index.html` | 範例頁面，使用 Import Map 讓所有模組共用同一份引擎 |
| `editor/main.js` | 範例進入點，展示如何啟動引擎並載入插件 |

---

## 快速開始

### 1. 建置 bundle

```bash
npm run build:bundle
# 輸出：dist/engine.bundle.js  dist/engine.bundle.js.map
```

### 2. 啟動本地伺服器

ES Module 需要透過 HTTP(S) 提供服務，無法直接以 `file://` 開啟。

```bash
# 任何靜態伺服器皆可，例如：
npx serve .
# 然後開啟 http://localhost:3000/editor/
```

### 3. 遊戲進入點

`editor/main.js` 示範最基本的用法：

```js
import { createEngine } from '@inkshot/engine';

const { core, renderer } = await createEngine({
  container: '#app',
  width: window.innerWidth,
  height: window.innerHeight,
});
```

`"@inkshot/engine"` 由 `editor/index.html` 中的 Import Map 解析至 `dist/engine.bundle.js`。

---

## Import Map 的作用

```html
<script type="importmap">
{
  "imports": {
    "@inkshot/engine": "../dist/engine.bundle.js"
  }
}
</script>
```

所有 import `"@inkshot/engine"` 的模組（包含插件）都會指向**同一個** `engine.bundle.js`。
這確保：
- 引擎代碼只載入一次
- 所有插件共享同一個 Pixi.js 應用程式實例
- 事件匯流排在整個頁面中是單一的

---

## 插件打包規範

若要讓自訂插件與此架構相容，插件必須以 `@inkshot/engine` 為 **external**，
輸出純 ESM 格式。這樣插件檔案只包含自己的邏輯，不重複打包引擎代碼。

### 使用 Rolldown

```js
// rolldown.plugin.config.js（插件專案中）
export default {
  input: 'src/index.ts',
  platform: 'browser',
  output: {
    file: 'dist/my-plugin.js',
    format: 'esm',
    codeSplitting: false,
  },
  external: ['@inkshot/engine'],
};
```

### 使用 Rollup

```js
// rollup.config.js
export default {
  input: 'src/index.ts',
  output: { file: 'dist/my-plugin.js', format: 'es' },
  external: ['@inkshot/engine'],
  plugins: [/* typescript plugin */],
};
```

### 使用 Vite（library 模式）

```js
// vite.config.js
export default {
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'my-plugin' },
    rollupOptions: { external: ['@inkshot/engine'] },
  },
};
```

### package.json 規範

每個 `@inkshot/*` 插件套件必須宣告：

```json
{
  "peerDependencies": {
    "@inkshot/engine": "^0.2.0"
  }
}
```

> **不要**將 `@inkshot/engine` 加入 `dependencies` 或 `devDependencies` 並 bundle 進輸出。

---

## 載入插件

將打包好的插件 `.js` 檔案放入 `editor/plugins/` 目錄，然後在 `editor/main.js` 中：

```js
import { createEngine } from '@inkshot/engine';
import myPlugin from './plugins/my-plugin.js';

const { core } = await createEngine({
  container: '#app',
  width: 1280,
  height: 720,
  plugins: [myPlugin],
});
```

也可以用 URL 字串動態載入（`PluginSource` 支援字串形式）：

```js
const { core } = await createEngine({
  plugins: ['https://cdn.example.com/my-plugin.js'],
});
```

---

## 瀏覽器支援

| 功能 | Chrome | Firefox | Safari |
|------|--------|---------|--------|
| ES Modules | 61+ | 60+ | 10.1+ |
| Import Maps | 89+ | 108+ | 16.4+ |
| `modulepreload` | 66+ | 115+ | 17+ |

所有現代主流瀏覽器皆已完整支援。

---

## 相關文件

- [Plugin 開發指南](./plugin-development.md)
- [快速入門](./getting-started.md)
- [架構設計文件](../../ARCHITECTURE.md)
