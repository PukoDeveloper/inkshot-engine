import { Container, Graphics, HTMLText, Text } from 'pixi.js';
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  UIWidget,
  UIWidgetFactory,
  UIAnchor,
  UICreateParams,
  UICreateOutput,
  UIRegisterParams,
  UIRegisterOutput,
  UIShowParams,
  UIHideParams,
  UIDestroyParams,
  UIUpdateParams,
  UIGetParams,
  UIGetOutput,
  UICreatedParams,
  UIShownParams,
  UIHiddenParams,
  UIDestroyedParams,
  UILabelProps,
  UIButtonProps,
  UIPanelProps,
  UIProgressBarProps,
  UISliderProps,
  UIScrollViewProps,
  UIDialogProps,
  UIStackPanelProps,
  UIScrollViewWidget,
  UIStackPanelWidget,
  UIDialogueBoxProps,
} from '../types/ui.js';
import type {
  DialogueNodeParams,
  DialogueTextTickParams,
  DialogueChoicesParams,
  DialogueEndedParams,
  DialogueTextSegment,
} from '../types/dialogue.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _nextId = 0;
function generateId(): string {
  return `ui_${++_nextId}`;
}

/**
 * Translate an {@link UIAnchor} into a pixel position within the given
 * viewport, offset by the caller-supplied `x` / `y` values.
 *
 * Returns the resulting `{ x, y }` to assign to the widget container.
 *
 * Widget width/height are required to correctly right-align or bottom-align;
 * pass `0` when the widget dimensions are unknown.
 */
function resolveAnchorPosition(
  anchor: UIAnchor,
  vpWidth: number,
  vpHeight: number,
  widgetWidth: number,
  widgetHeight: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  let x = 0;
  let y = 0;

  const col = anchor.split('-')[1];  // 'left' | 'center' | 'right'
  const row = anchor.split('-')[0];  // 'top'  | 'middle' | 'bottom'

  switch (col) {
    case 'center': x = (vpWidth - widgetWidth) / 2; break;
    case 'right':  x = vpWidth - widgetWidth;       break;
    default:       x = 0;                            break; // left
  }

  switch (row) {
    case 'middle': y = (vpHeight - widgetHeight) / 2; break;
    case 'bottom': y = vpHeight - widgetHeight;        break;
    default:       y = 0;                              break; // top
  }

  return { x: x + offsetX, y: y + offsetY };
}

// ---------------------------------------------------------------------------
// Built-in widget: Label
// ---------------------------------------------------------------------------

function createLabel(id: string, props: UILabelProps, core: Core): UIWidget {
  const container = new Container();
  container.label = `ui:label:${id}`;

  const style = {
    fontSize: props.fontSize ?? 16,
    fill: props.color ?? 0xffffff,
    fontFamily: props.fontFamily ?? 'Arial',
    align: props.align ?? 'left',
    wordWrap: props.wordWrapWidth !== undefined,
    wordWrapWidth: props.wordWrapWidth ?? 0,
  };

  const textNode = new Text({ text: '', style });
  container.addChild(textNode);

  /** Re-translate or set the display text. */
  function refreshText(locale?: string): void {
    void locale;
    if (props.i18nKey) {
      const { output } = core.events.emitSync<{ key: string; args?: Record<string, string> }, { value: string }>(
        'i18n/t',
        { key: props.i18nKey, args: props.i18nArgs },
      );
      textNode.text = output.value ?? props.i18nKey;
    } else {
      textNode.text = props.text ?? '';
    }
  }

  refreshText();

  return {
    id,
    type: 'label',
    container,
    show()  { container.visible = true; },
    hide()  { container.visible = false; },
    destroy() { container.destroy({ children: true }); },
    update(newProps) {
      if (typeof newProps['text'] === 'string') textNode.text = newProps['text'] as string;
      if (typeof newProps['color'] === 'number') (textNode.style as unknown as Record<string, unknown>)['fill'] = newProps['color'];
      if (typeof newProps['fontSize'] === 'number') (textNode.style as unknown as Record<string, unknown>)['fontSize'] = newProps['fontSize'];
    },
    onLocaleChanged(locale) { refreshText(locale); },
  };
}

// ---------------------------------------------------------------------------
// Built-in widget: Button
// ---------------------------------------------------------------------------

function createButton(id: string, props: UIButtonProps, core: Core): UIWidget {
  const width         = props.width           ?? 120;
  const height        = props.height          ?? 40;
  const bgColor       = props.backgroundColor ?? 0x3a3a5c;
  const hoverColor    = props.hoverColor       ?? 0x5a5a8c;
  const pressColor    = props.pressColor       ?? 0x2a2a4c;
  const textColor     = props.textColor        ?? 0xffffff;
  const cornerRadius  = props.cornerRadius     ?? 6;
  const fontSize      = props.fontSize         ?? 14;

  const container = new Container();
  container.label = `ui:button:${id}`;

  const bg = new Graphics();
  container.addChild(bg);

  const textNode = new Text({ text: '', style: { fontSize, fill: textColor, fontFamily: 'Arial' } });
  textNode.anchor.set(0.5, 0.5);
  textNode.x = width / 2;
  textNode.y = height / 2;
  container.addChild(textNode);

  let currentBg = bgColor;

  function redraw(color: number): void {
    bg.clear();
    bg.roundRect(0, 0, width, height, cornerRadius);
    bg.fill({ color });
  }

  function refreshText(locale?: string): void {
    void locale;
    if (props.i18nKey) {
      const { output } = core.events.emitSync<{ key: string; args?: Record<string, string> }, { value: string }>(
        'i18n/t',
        { key: props.i18nKey, args: props.i18nArgs },
      );
      textNode.text = output.value ?? props.i18nKey;
    } else {
      textNode.text = props.text ?? '';
    }
  }

  redraw(bgColor);
  refreshText();

  // Interactivity
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.on('pointerover',  () => { currentBg = hoverColor; redraw(hoverColor); });
  container.on('pointerout',   () => { currentBg = bgColor;    redraw(bgColor);    });
  container.on('pointerdown',  () => { currentBg = pressColor; redraw(pressColor); });
  container.on('pointerup',    () => { currentBg = hoverColor; redraw(hoverColor); props.onClick?.(); });
  container.on('pointertap',   () => { props.onClick?.(); });

  void currentBg;

  return {
    id,
    type: 'button',
    container,
    show()  { container.visible = true; },
    hide()  { container.visible = false; },
    destroy() { container.destroy({ children: true }); },
    update(newProps) {
      if (typeof newProps['text'] === 'string') textNode.text = newProps['text'] as string;
    },
    onLocaleChanged(locale) { refreshText(locale); },
  };
}

// ---------------------------------------------------------------------------
// Built-in widget: Panel
// ---------------------------------------------------------------------------

function createPanel(id: string, props: UIPanelProps, _core: Core): UIWidget {
  const container = new Container();
  container.label = `ui:panel:${id}`;
  if (props.alpha !== undefined) container.alpha = props.alpha;

  const bg = new Graphics();
  container.addChild(bg);

  function redraw(): void {
    bg.clear();
    bg.roundRect(0, 0, props.width, props.height, props.cornerRadius ?? 0);
    bg.fill({ color: props.backgroundColor ?? 0x1a1a2e });
    if (props.borderColor !== undefined && (props.borderWidth ?? 0) > 0) {
      bg.stroke({ width: props.borderWidth!, color: props.borderColor });
    }
  }

  redraw();

  return {
    id,
    type: 'panel',
    container,
    show()  { container.visible = true; },
    hide()  { container.visible = false; },
    destroy() { container.destroy({ children: true }); },
    update(newProps) {
      if (typeof newProps['alpha'] === 'number') container.alpha = newProps['alpha'] as number;
      redraw();
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in widget: ProgressBar
// ---------------------------------------------------------------------------

function createProgressBar(id: string, props: UIProgressBarProps, _core: Core): UIWidget {
  const totalWidth  = props.width;
  const totalHeight = props.height    ?? 16;
  const direction   = props.direction ?? 'horizontal';
  const bgColor     = props.backgroundColor  ?? 0x333355;
  const fgColor     = props.foregroundColor  ?? 0x44aaff;
  const radius      = props.cornerRadius     ?? 3;

  const container = new Container();
  container.label = `ui:progressbar:${id}`;

  const bgGraphics = new Graphics();
  const fgGraphics = new Graphics();
  container.addChild(bgGraphics);
  container.addChild(fgGraphics);

  let _value = Math.max(0, Math.min(1, props.value ?? 0));

  function redraw(): void {
    bgGraphics.clear();
    bgGraphics.roundRect(0, 0, totalWidth, totalHeight, radius);
    bgGraphics.fill({ color: bgColor });

    fgGraphics.clear();
    if (direction === 'horizontal') {
      fgGraphics.roundRect(0, 0, totalWidth * _value, totalHeight, radius);
    } else {
      const fgH = totalHeight * _value;
      fgGraphics.roundRect(0, totalHeight - fgH, totalWidth, fgH, radius);
    }
    fgGraphics.fill({ color: fgColor });
  }

  redraw();

  return {
    id,
    type: 'progressbar',
    container,
    show()  { container.visible = true; },
    hide()  { container.visible = false; },
    destroy() { container.destroy({ children: true }); },
    update(newProps) {
      if (typeof newProps['value'] === 'number') {
        _value = Math.max(0, Math.min(1, newProps['value'] as number));
        redraw();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in widget: Slider
// ---------------------------------------------------------------------------

function createSlider(id: string, props: UISliderProps, _core: Core): UIWidget {
  const totalWidth  = props.width;
  const trackHeight = props.height      ?? 8;
  const thumbRadius = props.thumbRadius ?? 10;
  const trackColor  = props.trackColor  ?? 0x333355;
  const thumbColor  = props.thumbColor  ?? 0x44aaff;

  const container = new Container();
  container.label = `ui:slider:${id}`;

  const track = new Graphics();
  const thumb = new Graphics();
  container.addChild(track);
  container.addChild(thumb);

  let _value = Math.max(0, Math.min(1, props.value ?? 0));
  let _dragging = false;
  let _startX   = 0;
  let _startVal = 0;

  function redrawTrack(): void {
    track.clear();
    track.roundRect(0, (thumbRadius - trackHeight / 2), totalWidth, trackHeight, trackHeight / 2);
    track.fill({ color: trackColor });
  }

  function redrawThumb(): void {
    thumb.clear();
    thumb.circle(0, 0, thumbRadius);
    thumb.fill({ color: thumbColor });
    thumb.x = _value * totalWidth;
    thumb.y = thumbRadius;
  }

  redrawTrack();
  redrawThumb();

  // Drag interaction
  thumb.eventMode = 'static';
  thumb.cursor = 'pointer';

  thumb.on('pointerdown', (e: { global: { x: number } }) => {
    _dragging = true;
    _startX   = e.global.x;
    _startVal = _value;
  });

  // Global pointermove / pointerup on container (captures drag outside thumb)
  container.eventMode = 'static';
  container.hitArea = { contains: (_x: number, _y: number) => true } as unknown as import('pixi.js').Rectangle;

  container.on('pointermove', (e: { global: { x: number } }) => {
    if (!_dragging) return;
    const dx  = e.global.x - _startX;
    _value = Math.max(0, Math.min(1, _startVal + dx / totalWidth));
    redrawThumb();
    props.onChange?.(_value);
  });

  container.on('pointerup',     () => { _dragging = false; });
  container.on('pointerupoutside', () => { _dragging = false; });

  return {
    id,
    type: 'slider',
    container,
    show()  { container.visible = true; },
    hide()  { container.visible = false; },
    destroy() { container.destroy({ children: true }); },
    update(newProps) {
      if (typeof newProps['value'] === 'number') {
        _value = Math.max(0, Math.min(1, newProps['value'] as number));
        redrawThumb();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in widget: ScrollView
// ---------------------------------------------------------------------------

function createScrollView(id: string, props: UIScrollViewProps, _core: Core): UIScrollViewWidget {
  const { width, height } = props;
  const bgColor = props.backgroundColor ?? 0x111122;

  const container = new Container();
  container.label = `ui:scrollview:${id}`;

  // Background
  const bg = new Graphics();
  bg.roundRect(0, 0, width, height, 0);
  bg.fill({ color: bgColor });
  container.addChild(bg);

  // Content container (scrolls inside the mask)
  const content = new Container();
  container.addChild(content);

  // Mask
  const mask = new Graphics();
  mask.rect(0, 0, width, height);
  mask.fill({ color: 0xffffff });
  container.addChild(mask);
  content.mask = mask;

  // Drag-to-scroll
  let _dragging  = false;
  let _startY    = 0;
  let _startCY   = 0;
  let _contentH  = 0;

  container.eventMode = 'static';
  container.on('pointerdown', (e: { global: { y: number } }) => {
    _dragging = true;
    _startY   = e.global.y;
    _startCY  = content.y;
  });
  container.on('pointermove', (e: { global: { y: number } }) => {
    if (!_dragging) return;
    const dy    = e.global.y - _startY;
    const minY  = Math.min(0, height - _contentH);
    content.y   = Math.max(minY, Math.min(0, _startCY + dy));
  });
  container.on('pointerup',        () => { _dragging = false; });
  container.on('pointerupoutside', () => { _dragging = false; });

  const children = new Map<string, UIWidget>();

  function recalcContentHeight(): void {
    _contentH = 0;
    for (const child of children.values()) {
      const b = child.container.getBounds();
      const bottom = child.container.y + b.height;
      if (bottom > _contentH) _contentH = bottom;
    }
  }

  const widget: UIScrollViewWidget = {
    id,
    type: 'scrollview',
    container,
    show()    { container.visible = true; },
    hide()    { container.visible = false; },
    destroy() {
      for (const child of children.values()) child.destroy();
      children.clear();
      container.destroy({ children: true });
    },
    addChild(child: UIWidget) {
      content.addChild(child.container);
      children.set(child.id, child);
      recalcContentHeight();
    },
    removeChild(childId: string) {
      const child = children.get(childId);
      if (!child) return;
      content.removeChild(child.container);
      children.delete(childId);
      recalcContentHeight();
    },
    setScroll(x: number, y: number) {
      content.x = x;
      content.y = y;
    },
  };

  return widget;
}

// ---------------------------------------------------------------------------
// Built-in widget: Dialog
// ---------------------------------------------------------------------------

function createDialog(id: string, props: UIDialogProps, core: Core): UIWidget {
  const dialogWidth  = props.width  ?? 320;
  const dialogHeight = props.height ?? 200;
  const showModal    = props.modal  !== false;

  // Determine viewport size for centering
  let vpWidth  = 800;
  let vpHeight = 600;
  try {
    vpWidth  = core.app.screen.width;
    vpHeight = core.app.screen.height;
  } catch {
    // no Pixi app in test environment; fall back to defaults
  }

  const root = new Container();
  root.label = `ui:dialog:${id}`;

  // Optional semi-transparent modal overlay
  if (showModal) {
    const overlay = new Graphics();
    overlay.rect(0, 0, vpWidth, vpHeight);
    overlay.fill({ color: 0x000000, alpha: 0.5 });
    overlay.eventMode = 'static'; // swallow input below the dialog
    root.addChild(overlay);
  }

  // Dialog panel
  const panel = new Graphics();
  panel.roundRect(0, 0, dialogWidth, dialogHeight, 8);
  panel.fill({ color: 0x2a2a4c });
  panel.stroke({ width: 2, color: 0x5a5a8c });
  panel.x = (vpWidth  - dialogWidth)  / 2;
  panel.y = (vpHeight - dialogHeight) / 2;
  root.addChild(panel);

  // Title text
  const titleNode = new Text({ text: '', style: { fontSize: 16, fill: 0xffffff, fontFamily: 'Arial', fontWeight: 'bold' } });
  titleNode.x = panel.x + 16;
  titleNode.y = panel.y + 16;
  root.addChild(titleNode);

  // Message text
  const messageNode = new Text({ text: '', style: { fontSize: 14, fill: 0xdddddd, fontFamily: 'Arial', wordWrap: true, wordWrapWidth: dialogWidth - 32 } });
  messageNode.x = panel.x + 16;
  messageNode.y = panel.y + 48;
  root.addChild(messageNode);

  // Confirm button
  const confirmBtnBg = new Graphics();
  const confirmBtnText = new Text({ text: '', style: { fontSize: 14, fill: 0xffffff, fontFamily: 'Arial' } });
  confirmBtnBg.roundRect(0, 0, 100, 32, 6);
  confirmBtnBg.fill({ color: 0x3366cc });
  confirmBtnBg.x = panel.x + dialogWidth / 2 - 110;
  confirmBtnBg.y = panel.y + dialogHeight - 48;
  confirmBtnBg.eventMode = 'static';
  confirmBtnBg.cursor = 'pointer';
  confirmBtnBg.on('pointertap', () => {
    props.onConfirm?.();
    root.visible = false;
  });
  confirmBtnText.anchor.set(0.5, 0.5);
  confirmBtnText.x = confirmBtnBg.x + 50;
  confirmBtnText.y = confirmBtnBg.y + 16;
  root.addChild(confirmBtnBg);
  root.addChild(confirmBtnText);

  // Cancel button (only if a handler or label is provided)
  const hasCancelButton = props.onCancel !== undefined || props.cancelText !== undefined || props.cancelI18nKey !== undefined;
  const cancelBtnBg   = new Graphics();
  const cancelBtnText = new Text({ text: '', style: { fontSize: 14, fill: 0xffffff, fontFamily: 'Arial' } });
  if (hasCancelButton) {
    cancelBtnBg.roundRect(0, 0, 100, 32, 6);
    cancelBtnBg.fill({ color: 0x555577 });
    cancelBtnBg.x = panel.x + dialogWidth / 2 + 10;
    cancelBtnBg.y = panel.y + dialogHeight - 48;
    cancelBtnBg.eventMode = 'static';
    cancelBtnBg.cursor = 'pointer';
    cancelBtnBg.on('pointertap', () => {
      props.onCancel?.();
      root.visible = false;
    });
    cancelBtnText.anchor.set(0.5, 0.5);
    cancelBtnText.x = cancelBtnBg.x + 50;
    cancelBtnText.y = cancelBtnBg.y + 16;
    root.addChild(cancelBtnBg);
    root.addChild(cancelBtnText);
  }

  function refreshText(locale?: string): void {
    void locale;
    // Title
    if (props.titleI18nKey) {
      const { output } = core.events.emitSync<{ key: string }, { value: string }>('i18n/t', { key: props.titleI18nKey });
      titleNode.text = output.value ?? props.titleI18nKey;
    } else {
      titleNode.text = props.title ?? '';
    }
    // Message
    if (props.messageI18nKey) {
      const { output } = core.events.emitSync<{ key: string }, { value: string }>('i18n/t', { key: props.messageI18nKey });
      messageNode.text = output.value ?? props.messageI18nKey;
    } else {
      messageNode.text = props.message ?? '';
    }
    // Confirm button text
    if (props.confirmI18nKey) {
      const { output } = core.events.emitSync<{ key: string }, { value: string }>('i18n/t', { key: props.confirmI18nKey });
      confirmBtnText.text = output.value ?? props.confirmI18nKey;
    } else {
      confirmBtnText.text = props.confirmText ?? 'OK';
    }
    // Cancel button text
    if (hasCancelButton) {
      if (props.cancelI18nKey) {
        const { output } = core.events.emitSync<{ key: string }, { value: string }>('i18n/t', { key: props.cancelI18nKey });
        cancelBtnText.text = output.value ?? props.cancelI18nKey;
      } else {
        cancelBtnText.text = props.cancelText ?? 'Cancel';
      }
    }
  }

  refreshText();

  return {
    id,
    type: 'dialog',
    container: root,
    show()    { root.visible = true; },
    hide()    { root.visible = false; },
    destroy() { root.destroy({ children: true }); },
    update(newProps) {
      if (typeof newProps['title']   === 'string') titleNode.text   = newProps['title']   as string;
      if (typeof newProps['message'] === 'string') messageNode.text = newProps['message'] as string;
    },
    onLocaleChanged(locale) { refreshText(locale); },
  };
}

// ---------------------------------------------------------------------------
// Built-in widget: StackPanel
// ---------------------------------------------------------------------------

function createStackPanel(id: string, props: UIStackPanelProps, _core: Core): UIStackPanelWidget {
  const direction = props.direction ?? 'vertical';
  const spacing   = props.spacing   ?? 8;
  const padding   = {
    top:    props.padding?.top    ?? 0,
    right:  props.padding?.right  ?? 0,
    bottom: props.padding?.bottom ?? 0,
    left:   props.padding?.left   ?? 0,
  };
  const align = props.align ?? 'start';

  const container = new Container();
  container.label = `ui:stack:${id}`;

  const childList: UIWidget[] = [];

  function reflow(): void {
    let cursor = direction === 'vertical' ? padding.top : padding.left;

    for (const child of childList) {
      const bounds = child.container.getBounds();
      if (direction === 'vertical') {
        child.container.y = cursor;
        switch (align) {
          case 'center': child.container.x = padding.left - bounds.width / 2; break;
          case 'end':    child.container.x = padding.left - bounds.width;     break;
          default:       child.container.x = padding.left;                    break;
        }
        cursor += bounds.height + spacing;
      } else {
        child.container.x = cursor;
        switch (align) {
          case 'center': child.container.y = padding.top - bounds.height / 2; break;
          case 'end':    child.container.y = padding.top - bounds.height;     break;
          default:       child.container.y = padding.top;                     break;
        }
        cursor += bounds.width + spacing;
      }
    }
  }

  const widget: UIStackPanelWidget = {
    id,
    type: 'stack',
    container,
    show()    { container.visible = true; },
    hide()    { container.visible = false; },
    destroy() {
      for (const child of childList) child.destroy();
      childList.length = 0;
      container.destroy({ children: true });
    },
    addChild(child: UIWidget) {
      container.addChild(child.container);
      childList.push(child);
      reflow();
    },
    removeChild(childId: string) {
      const idx = childList.findIndex(c => c.id === childId);
      if (idx < 0) return;
      const child = childList[idx]!;
      container.removeChild(child.container);
      childList.splice(idx, 1);
      reflow();
    },
    reflow,
  };

  return widget;
}

// ---------------------------------------------------------------------------
// Built-in widget: DialogueBox — markup helpers
// ---------------------------------------------------------------------------

/** Escape characters that are special in HTML. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert dialogue text segments into an HTML string suitable for
 * {@link https://pixijs.com/guides/components/text PixiJS HTMLText}.
 *
 * Segments without a `color` are rendered as plain (escaped) text; coloured
 * segments are wrapped in `<span style="color:#rrggbb;">…</span>`.
 */
function segmentsToHtml(segments: ReadonlyArray<DialogueTextSegment>): string {
  if (segments.length === 0) return '';
  if (segments.length === 1 && segments[0]!.color === undefined) {
    return escapeHtml(segments[0]!.text);
  }
  return segments
    .map(seg => {
      const escaped = escapeHtml(seg.text);
      if (seg.color !== undefined) {
        const hex = `#${seg.color.toString(16).padStart(6, '0')}`;
        return `<span style="color:${hex};">${escaped}</span>`;
      }
      return escaped;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Built-in widget: DialogueBox
// ---------------------------------------------------------------------------

function createDialogueBox(id: string, props: UIDialogueBoxProps, core: Core): UIWidget {
  const boxWidth     = props.width           ?? 600;
  const boxHeight    = props.height          ?? 160;
  const bgColor      = props.backgroundColor ?? 0x1a1a2e;
  const textColor    = props.textColor       ?? 0xffffff;
  const nameColor    = props.nameColor       ?? 0xffd700;
  const radius       = props.cornerRadius    ?? 8;
  const showPortrait = props.showPortrait    !== false;

  const portraitSize = 64;
  const portraitPad  = showPortrait ? portraitSize + 16 : 0;
  const padH         = 12;
  const padV         = 10;
  const textAreaX    = padH + portraitPad;
  const textAreaW    = boxWidth - textAreaX - padH;

  const root = new Container();
  root.label = `ui:dialoguebox:${id}`;

  // Panel background
  const panel = new Graphics();
  panel.roundRect(0, 0, boxWidth, boxHeight, radius);
  panel.fill({ color: bgColor });
  panel.stroke({ width: 1, color: 0x44446a });
  root.addChild(panel);

  // Portrait placeholder (simple box drawn on demand)
  const portraitSlot = new Graphics();
  if (showPortrait) {
    portraitSlot.x = padH;
    portraitSlot.y = (boxHeight - portraitSize) / 2;
    root.addChild(portraitSlot);
  }

  // Speaker name
  const nameNode = new Text({
    text: '',
    style: { fontSize: 14, fill: nameColor, fontFamily: 'Arial', fontWeight: 'bold' },
  });
  nameNode.x = textAreaX;
  nameNode.y = padV;
  root.addChild(nameNode);

  // Body text — HTMLText supports inline colour via <span style="color:…">
  const bodyNode = new HTMLText({
    text: '',
    style: {
      fontSize: 13,
      fill: textColor,
      fontFamily: 'Arial',
      wordWrap: true,
      wordWrapWidth: textAreaW,
    },
  });
  bodyNode.x = textAreaX;
  bodyNode.y = padV + 22;
  root.addChild(bodyNode);

  // Choices container
  const choicesContainer = new Container();
  choicesContainer.x = textAreaX;
  choicesContainer.y = padV + 22;
  choicesContainer.visible = false;
  root.addChild(choicesContainer);

  // Continue indicator (▼)
  const continueIndicator = new Text({
    text: '▼',
    style: { fontSize: 12, fill: 0xaaaaaa, fontFamily: 'Arial' },
  });
  continueIndicator.x = boxWidth - padH - 14;
  continueIndicator.y = boxHeight - padV - 16;
  continueIndicator.visible = false;
  root.addChild(continueIndicator);

  // ── Choice buttons state ───────────────────────────────────────────────
  const choiceButtons: Array<{ bg: Graphics; label: Text }> = [];

  function clearChoices(): void {
    for (const btn of choiceButtons) {
      choicesContainer.removeChild(btn.bg);
      choicesContainer.removeChild(btn.label);
      btn.bg.destroy();
      btn.label.destroy();
    }
    choiceButtons.length = 0;
  }

  function buildChoices(choices: ReadonlyArray<{ text: string; index: number }>): void {
    clearChoices();
    const btnWidth  = textAreaW;
    const btnHeight = 28;
    const gap       = 4;

    for (const choice of choices) {
      const bg = new Graphics();
      bg.roundRect(0, 0, btnWidth, btnHeight, 4);
      bg.fill({ color: 0x2d2d5e });
      bg.stroke({ width: 1, color: 0x5555aa });
      bg.y = choice.index * (btnHeight + gap);
      bg.eventMode = 'static';
      bg.cursor = 'pointer';
      bg.on('pointerover', () => {
        bg.clear();
        bg.roundRect(0, 0, btnWidth, btnHeight, 4);
        bg.fill({ color: 0x44449c });
        bg.stroke({ width: 1, color: 0x7777cc });
      });
      bg.on('pointerout', () => {
        bg.clear();
        bg.roundRect(0, 0, btnWidth, btnHeight, 4);
        bg.fill({ color: 0x2d2d5e });
        bg.stroke({ width: 1, color: 0x5555aa });
      });
      bg.on('pointertap', () => {
        core.events.emitSync('dialogue/choice', { index: choice.index });
      });

      const label = new Text({
        text: choice.text,
        style: { fontSize: 12, fill: 0xffffff, fontFamily: 'Arial' },
      });
      label.x = 8;
      label.y = bg.y + (btnHeight - 14) / 2;

      choicesContainer.addChild(bg);
      choicesContainer.addChild(label);
      choiceButtons.push({ bg, label });
    }
  }

  // ── Subscribe to dialogue events ─────────────────────────────────────
  const ns = `ui:dialoguebox:${id}`;

  core.events.on<DialogueNodeParams>(ns, 'dialogue/node', (params) => {
    nameNode.text  = params.speaker ?? '';
    bodyNode.text  = '';
    continueIndicator.visible = false;
    choicesContainer.visible  = false;
    bodyNode.visible          = true;

    // Draw portrait placeholder
    if (showPortrait) {
      portraitSlot.clear();
      if (params.portrait) {
        portraitSlot.roundRect(0, 0, portraitSize, portraitSize, 4);
        portraitSlot.fill({ color: 0x333355 });
        portraitSlot.stroke({ width: 1, color: 0x5555aa });
      }
    }
  });

  core.events.on<DialogueTextTickParams>(ns, 'dialogue/text:tick', (params) => {
    bodyNode.text = segmentsToHtml(params.segments);
    if (params.done) {
      continueIndicator.visible = true;
    }
  });

  core.events.on<DialogueChoicesParams>(ns, 'dialogue/choices', (params) => {
    bodyNode.visible = false;
    choicesContainer.visible = true;
    continueIndicator.visible = false;
    buildChoices(params.choices);
  });

  core.events.on<DialogueEndedParams>(ns, 'dialogue/ended', () => {
    root.visible = false;
  });

  return {
    id,
    type: 'dialoguebox',
    container: root,
    show()  { root.visible = true; },
    hide()  { root.visible = false; },
    destroy() {
      clearChoices();
      core.events.removeNamespace(ns);
      root.destroy({ children: true });
    },
    update(newProps) {
      if (typeof newProps['speakerName'] === 'string') nameNode.text = newProps['speakerName'] as string;
      if (typeof newProps['bodyText']    === 'string') bodyNode.text = newProps['bodyText']    as string;
    },
  };
}

// ---------------------------------------------------------------------------
// UIManager
// ---------------------------------------------------------------------------

/**
 * Plugin that provides a flexible, event-driven UI widget system.
 *
 * ### Widget registry
 * UIManager ships with eight built-in widget types:
 *
 * | Type          | Description                                  |
 * |---------------|----------------------------------------------|
 * | `label`       | Text display (supports i18n)                 |
 * | `button`      | Clickable button with hover/press states     |
 * | `panel`       | Styled background container                  |
 * | `progressbar` | Horizontal or vertical progress indicator    |
 * | `slider`      | Draggable range input                        |
 * | `scrollview`  | Masked scrollable content area               |
 * | `dialog`      | Modal dialog with confirm / cancel actions   |
 * | `stack`       | Linear layout container (StackPanel)         |
 *
 * Register additional types at any time with `ui/register`:
 * ```ts
 * core.events.emitSync('ui/register', { type: 'myGame/hud', factory: hudFactory });
 * ```
 *
 * ### EventBus API
 *
 * | Event         | Description                                      |
 * |---------------|--------------------------------------------------|
 * | `ui/register` | Register (or replace) a widget factory           |
 * | `ui/create`   | Create a widget and mount it on the ui layer     |
 * | `ui/show`     | Make a widget visible                            |
 * | `ui/hide`     | Make a widget invisible (keeps it in memory)     |
 * | `ui/destroy`  | Destroy a widget and remove it from the layer    |
 * | `ui/update`   | Update properties of an existing widget          |
 * | `ui/get`      | Retrieve a widget instance by id                 |
 *
 * ### Notifications emitted
 *
 * | Event          | When                                            |
 * |----------------|-------------------------------------------------|
 * | `ui/created`   | After a widget is created                       |
 * | `ui/shown`     | After a widget is made visible                  |
 * | `ui/hidden`    | After a widget is hidden                        |
 * | `ui/destroyed` | After a widget is destroyed                     |
 *
 * ### Layout / anchor
 * Widgets can be positioned relative to the viewport by supplying an
 * `anchor` plus pixel `x` / `y` offsets in `ui/create` params.
 *
 * @example
 * ```ts
 * import { createEngine, UIManager } from 'inkshot-engine';
 *
 * const ui = new UIManager();
 * const { core } = await createEngine({ plugins: [ui] });
 *
 * // Create a label anchored to the top-right corner
 * const { output } = core.events.emitSync('ui/create', {
 *   type: 'label',
 *   id: 'score',
 *   text: 'Score: 0',
 *   anchor: 'top-right',
 *   x: -16,
 *   y: 16,
 * });
 * const scoreLabel = output.widget;
 *
 * // Update later
 * core.events.emitSync('ui/update', { id: 'score', text: 'Score: 42' });
 * ```
 */
export class UIManager implements EnginePlugin {
  readonly namespace   = 'ui';
  readonly dependencies: readonly string[] = [];

  private _core!: Core;
  private _layer!: Container;
  private readonly _factories = new Map<string, UIWidgetFactory>();
  private readonly _widgets   = new Map<string, UIWidget>();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    // Retrieve the ui render layer
    const { output } = core.events.emitSync<{ name: string }, { layer: Container }>(
      'renderer/layer',
      { name: 'ui' },
    );
    this._layer = output.layer;

    // Register built-in factories
    this._factories.set('label',       createLabel       as UIWidgetFactory);
    this._factories.set('button',      createButton      as UIWidgetFactory);
    this._factories.set('panel',       createPanel       as UIWidgetFactory);
    this._factories.set('progressbar', createProgressBar as UIWidgetFactory);
    this._factories.set('slider',      createSlider      as UIWidgetFactory);
    this._factories.set('scrollview',  createScrollView  as unknown as UIWidgetFactory);
    this._factories.set('dialog',      createDialog      as UIWidgetFactory);
    this._factories.set('stack',       createStackPanel  as unknown as UIWidgetFactory);
    this._factories.set('dialoguebox', createDialogueBox as UIWidgetFactory);

    // ── Event handlers ────────────────────────────────────────────────────

    core.events.on('ui', 'ui/register', (params: UIRegisterParams, output: UIRegisterOutput) => {
      const isNew = !this._factories.has(params.type);
      this._factories.set(params.type, params.factory);
      output.registered = isNew;
    });

    core.events.on('ui', 'ui/create', (params: UICreateParams, output: UICreateOutput) => {
      output.widget = this.create(params);
    });

    core.events.on('ui', 'ui/show', (params: UIShowParams) => {
      this.show(params.id);
    });

    core.events.on('ui', 'ui/hide', (params: UIHideParams) => {
      this.hide(params.id);
    });

    core.events.on('ui', 'ui/destroy', (params: UIDestroyParams) => {
      this._destroyById(params.id);
    });

    core.events.on('ui', 'ui/update', (params: UIUpdateParams) => {
      const { id, ...rest } = params;
      this.update(id, rest);
    });

    core.events.on('ui', 'ui/get', (params: UIGetParams, output: UIGetOutput) => {
      output.widget = this._widgets.get(params.id);
    });

    // Propagate locale changes to all widgets that opt-in
    core.events.on('ui', 'i18n/changed', (params: { locale: string }) => {
      for (const widget of this._widgets.values()) {
        widget.onLocaleChanged?.(params.locale);
      }
    });
  }

  destroy(core: Core): void {
    // Engine teardown: destroy all widgets and unregister listeners
    for (const id of [...this._widgets.keys()]) {
      this._destroyById(id);
    }
    this._factories.clear();
    core.events.removeNamespace('ui');
  }

  // ---------------------------------------------------------------------------
  // Direct API
  // ---------------------------------------------------------------------------

  /**
   * Register a widget factory for the given `type` name.
   *
   * Replaces any previously registered factory for the same type.
   * This is the programmatic equivalent of `ui/register`.
   *
   * @example
   * ```ts
   * uiManager.register('myGame/healthbar', healthBarFactory);
   * ```
   */
  register<P extends Record<string, unknown>>(type: string, factory: UIWidgetFactory<P>): void {
    this._factories.set(type, factory as UIWidgetFactory);
  }

  /**
   * Create a widget of `params.type`, mount it on the ui layer, and return it.
   *
   * This is the programmatic equivalent of `ui/create`.
   *
   * @throws If the type is not registered.
   * @throws If a widget with the same `id` already exists.
   */
  create(params: UICreateParams): UIWidget {
    const factory = this._factories.get(params.type);
    if (!factory) {
      throw new Error(
        `[UIManager] Unknown widget type: "${params.type}". ` +
        `Register it first with ui/register or uiManager.register().`,
      );
    }

    const id = params.id ?? generateId();
    if (this._widgets.has(id)) {
      throw new Error(`[UIManager] A widget with id "${id}" already exists.`);
    }

    const widget = factory(id, params as Record<string, unknown>, this._core);

    // Apply anchor-based layout
    if (params.anchor) {
      let vpWidth  = 800;
      let vpHeight = 600;
      try {
        vpWidth  = this._core.app.screen.width;
        vpHeight = this._core.app.screen.height;
      } catch {
        // test environment — use fallback dimensions
      }

      const bounds = widget.container.getBounds();
      const pos = resolveAnchorPosition(
        params.anchor,
        vpWidth,
        vpHeight,
        bounds.width,
        bounds.height,
        params.x ?? 0,
        params.y ?? 0,
      );
      widget.container.x = pos.x;
      widget.container.y = pos.y;
    } else {
      if (params.x !== undefined) widget.container.x = params.x;
      if (params.y !== undefined) widget.container.y = params.y;
    }

    this._layer.addChild(widget.container);
    this._widgets.set(id, widget);

    this._core.events.emitSync<UICreatedParams>('ui/created', { id, type: params.type, widget });

    return widget;
  }

  /**
   * Make a widget visible by id.
   * No-op if the widget is already visible.
   */
  show(id: string): void {
    const widget = this._widgets.get(id);
    if (!widget) {
      console.warn(`[UIManager] show(): no widget with id "${id}".`);
      return;
    }
    widget.show();
    this._core.events.emitSync<UIShownParams>('ui/shown', { id });
  }

  /**
   * Hide a widget by id.
   * No-op if the widget is already hidden.
   */
  hide(id: string): void {
    const widget = this._widgets.get(id);
    if (!widget) {
      console.warn(`[UIManager] hide(): no widget with id "${id}".`);
      return;
    }
    widget.hide();
    this._core.events.emitSync<UIHiddenParams>('ui/hidden', { id });
  }

  /**
   * Destroy a widget and remove it from the ui layer.
   *
   * After this call the widget id is freed and may be reused.
   * This is the programmatic equivalent of `ui/destroy`.
   */
  destroyWidget(id: string): void {
    this._destroyById(id);
  }

  private _destroyById(id: string): void {
    const widget = this._widgets.get(id);
    if (!widget) return;
    this._layer.removeChild(widget.container);
    widget.destroy();
    this._widgets.delete(id);
    this._core.events.emitSync<UIDestroyedParams>('ui/destroyed', { id });
  }

  /**
   * Pass a partial property update to a widget's `update()` method.
   * No-op if the widget doesn't implement `update`.
   */
  update(id: string, props: Record<string, unknown>): void {
    const widget = this._widgets.get(id);
    if (!widget) {
      console.warn(`[UIManager] update(): no widget with id "${id}".`);
      return;
    }
    widget.update?.(props);
  }

  /**
   * Return the widget instance for the given `id`, or `undefined` if it does
   * not exist.
   */
  get(id: string): UIWidget | undefined {
    return this._widgets.get(id);
  }

  /** How many widgets are currently managed by this UIManager. */
  get widgetCount(): number {
    return this._widgets.size;
  }

  /** Whether a widget with the given id currently exists. */
  has(id: string): boolean {
    return this._widgets.has(id);
  }

  /** Whether a factory for the given widget type is registered. */
  hasFactory(type: string): boolean {
    return this._factories.has(type);
  }
}
