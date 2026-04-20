import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { UIManager } from '../src/plugins/UIManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  UIWidget,
  UIWidgetFactory,
  UICreateOutput,
  UIRegisterOutput,
  UIGetOutput,
} from '../src/types/ui.js';

// ---------------------------------------------------------------------------
// Pixi stubs
// We mock the parts of pixi.js that UIManager touches so tests run in Node /
// jsdom without a real GPU context.
// ---------------------------------------------------------------------------

vi.mock('pixi.js', async () => {
  class Container {
    label = '';
    x = 0;
    y = 0;
    alpha = 1;
    visible = true;
    eventMode = 'none';
    cursor = 'default';
    hitArea: unknown = null;
    mask: unknown = null;
    children: unknown[] = [];
    _listeners: Record<string, Array<(e: unknown) => void>> = {};

    addChild(child: unknown) {
      this.children.push(child);
      return child;
    }
    removeChild(child: unknown) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
    }
    getBounds() {
      return { width: 0, height: 0, x: this.x, y: this.y };
    }
    on(event: string, handler: (e: unknown) => void) {
      (this._listeners[event] ??= []).push(handler);
    }
    emit(event: string, e: unknown = {}) {
      for (const h of this._listeners[event] ?? []) h(e);
    }
    destroy() {}
  }

  class Graphics extends Container {
    _cmds: string[] = [];

    clear() { this._cmds = []; return this; }
    roundRect(..._args: unknown[]) { this._cmds.push('roundRect'); return this; }
    rect(..._args: unknown[])      { this._cmds.push('rect');      return this; }
    circle(..._args: unknown[])    { this._cmds.push('circle');    return this; }
    fill(_opts: unknown)   { this._cmds.push('fill');   return this; }
    stroke(_opts: unknown) { this._cmds.push('stroke'); return this; }
  }

  class Text extends Container {
    text: string;
    style: Record<string, unknown>;
    anchor = { set: vi.fn() };

    constructor(opts: { text?: string; style?: Record<string, unknown> } = {}) {
      super();
      this.text  = opts.text  ?? '';
      this.style = opts.style ?? {};
    }
  }

  return { Container, Graphics, Text, HTMLText: Text, __esModule: true };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type UiLayerStub = {
  children: unknown[];
  addChild(c: unknown): void;
  removeChild(c: unknown): void;
};

function createUiLayerStub(): UiLayerStub {
  const children: unknown[] = [];
  return {
    children,
    addChild(c: unknown)  { children.push(c); },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
    },
  };
}

function createCoreStub(uiLayer: UiLayerStub) {
  const events = new EventBus();
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
    if (_p.name === 'ui') output.layer = uiLayer;
  });
  return { events } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UIManager', () => {
  let uiLayer: UiLayerStub;
  let core: Core;
  let ui: UIManager;

  beforeEach(() => {
    uiLayer = createUiLayerStub();
    core    = createCoreStub(uiLayer);
    ui      = new UIManager();
    ui.init(core);
  });

  afterEach(() => {
    ui.destroy(core);
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('init', () => {
    it('registers all nine built-in widget types', () => {
      for (const type of ['label', 'button', 'panel', 'progressbar', 'slider', 'scrollview', 'dialog', 'stack', 'dialoguebox']) {
        expect(ui.hasFactory(type)).toBe(true);
      }
    });

    it('starts with no widget instances', () => {
      expect(ui.widgetCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // ui/register
  // -------------------------------------------------------------------------

  describe('ui/register', () => {
    it('registers a custom factory and reports registered=true', () => {
      const factory: UIWidgetFactory = vi.fn().mockReturnValue({
        id: 'x', type: 'custom', container: {},
        show: vi.fn(), hide: vi.fn(), destroy: vi.fn(),
      });

      const { output } = core.events.emitSync<UIRegisterParams, UIRegisterOutput>(
        'ui/register',
        { type: 'custom', factory },
      );

      expect(output.registered).toBe(true);
      expect(ui.hasFactory('custom')).toBe(true);
    });

    it('replacing an existing factory reports registered=false', () => {
      const factory: UIWidgetFactory = vi.fn() as unknown as UIWidgetFactory;

      core.events.emitSync('ui/register', { type: 'label', factory });

      const { output } = core.events.emitSync<UIRegisterParams, UIRegisterOutput>(
        'ui/register',
        { type: 'label', factory },
      );
      expect(output.registered).toBe(false);
    });

    it('calls the custom factory when creating the registered type', () => {
      const widget = {
        id: 'w1', type: 'custom',
        container: { x: 0, y: 0, visible: true, addChild: vi.fn(), removeChild: vi.fn(), getBounds: () => ({ width: 0, height: 0 }) },
        show: vi.fn(), hide: vi.fn(), destroy: vi.fn(),
      };
      const factory: UIWidgetFactory = vi.fn().mockReturnValue(widget);

      core.events.emitSync('ui/register', { type: 'custom', factory });
      const { output } = core.events.emitSync<UIRegisterParams, UICreateOutput>(
        'ui/create',
        { type: 'custom', id: 'w1' },
      );

      expect(factory).toHaveBeenCalledOnce();
      expect(output.widget.id).toBe('w1');
    });

    it('direct register() method works the same way', () => {
      const factory: UIWidgetFactory = vi.fn() as unknown as UIWidgetFactory;
      ui.register('myType', factory);
      expect(ui.hasFactory('myType')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // ui/create
  // -------------------------------------------------------------------------

  describe('ui/create', () => {
    it('creates a label and mounts it on the ui layer', () => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'label', id: 'lbl1', text: 'Hello' },
      );
      expect(output.widget).toBeDefined();
      expect(output.widget.id).toBe('lbl1');
      expect(output.widget.type).toBe('label');
      expect(uiLayer.children).toContain(output.widget.container);
      expect(ui.widgetCount).toBe(1);
    });

    it('auto-generates an id when none is provided', () => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'label', text: 'auto' },
      );
      expect(output.widget.id).toMatch(/^ui_\d+$/);
    });

    it('applies x/y offset without anchor', () => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'label', id: 'lbl2', text: 'X', x: 50, y: 30 },
      );
      expect(output.widget.container.x).toBe(50);
      expect(output.widget.container.y).toBe(30);
    });

    it('throws when an unknown type is requested', () => {
      expect(() =>
        core.events.emitSync('ui/create', { type: 'nonexistent', id: 'err1' }),
      ).toThrow(/Unknown widget type/);
    });

    it('throws when a duplicate id is used', () => {
      core.events.emitSync('ui/create', { type: 'label', id: 'dup', text: '' });
      expect(() =>
        core.events.emitSync('ui/create', { type: 'label', id: 'dup', text: '' }),
      ).toThrow(/already exists/);
    });

    it('emits ui/created notification', () => {
      const handler = vi.fn();
      core.events.on('test', 'ui/created', handler);

      core.events.emitSync('ui/create', { type: 'label', id: 'notif', text: 'hi' });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![0]).toMatchObject({ id: 'notif', type: 'label' });
    });

    it('creates all eight built-in widget types without throwing', () => {
      const types: Array<{ type: string; extra?: Record<string, unknown> }> = [
        { type: 'label',       extra: { text: 'hello' } },
        { type: 'button',      extra: { text: 'click me' } },
        { type: 'panel',       extra: { width: 200, height: 100 } },
        { type: 'progressbar', extra: { width: 200, value: 0.5 } },
        { type: 'slider',      extra: { width: 200 } },
        { type: 'scrollview',  extra: { width: 300, height: 200 } },
        { type: 'dialog',      extra: { title: 'Confirm?' } },
        { type: 'stack',       extra: {} },
        { type: 'dialoguebox', extra: { width: 400, height: 120 } },
      ];

      for (const { type, extra } of types) {
        expect(() =>
          core.events.emitSync('ui/create', { type, id: `${type}_test`, ...extra }),
        ).not.toThrow();
      }
    });
  });

  // -------------------------------------------------------------------------
  // ui/show  /  ui/hide
  // -------------------------------------------------------------------------

  describe('ui/show and ui/hide', () => {
    let widget: UIWidget;

    beforeEach(() => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'label', id: 'vis', text: 'visibility test' },
      );
      widget = output.widget;
    });

    it('show() sets container.visible to true and emits ui/shown', () => {
      widget.container.visible = false;
      const handler = vi.fn();
      core.events.on('test', 'ui/shown', handler);

      core.events.emitSync('ui/show', { id: 'vis' });

      expect(widget.container.visible).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('hide() sets container.visible to false and emits ui/hidden', () => {
      const handler = vi.fn();
      core.events.on('test', 'ui/hidden', handler);

      core.events.emitSync('ui/hide', { id: 'vis' });

      expect(widget.container.visible).toBe(false);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('show() warns and does nothing for an unknown id', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('ui/show', { id: 'ghost' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ghost"'));
      warn.mockRestore();
    });

    it('hide() warns and does nothing for an unknown id', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('ui/hide', { id: 'ghost' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ghost"'));
      warn.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // ui/destroy
  // -------------------------------------------------------------------------

  describe('ui/destroy', () => {
    it('removes widget from layer and emits ui/destroyed', () => {
      core.events.emitSync('ui/create', { type: 'label', id: 'del', text: '' });
      expect(ui.widgetCount).toBe(1);

      const handler = vi.fn();
      core.events.on('test', 'ui/destroyed', handler);

      core.events.emitSync('ui/destroy', { id: 'del' });

      expect(ui.widgetCount).toBe(0);
      expect(ui.has('del')).toBe(false);
      expect(uiLayer.children).toHaveLength(0);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![0]).toMatchObject({ id: 'del' });
    });

    it('is a no-op for an id that does not exist', () => {
      expect(() =>
        core.events.emitSync('ui/destroy', { id: 'nope' }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // ui/update
  // -------------------------------------------------------------------------

  describe('ui/update', () => {
    it('updates label text via event', () => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'label', id: 'upd', text: 'old' },
      );
      const widget = output.widget as UIWidget & { container: { children: Array<{ text: string }> } };

      core.events.emitSync('ui/update', { id: 'upd', text: 'new' });

      const textNode = widget.container.children[0];
      expect(textNode?.text).toBe('new');
    });

    it('updates progressbar value', () => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'progressbar', id: 'pb', width: 100, value: 0 },
      );
      // Verify it doesn't throw and widget exists
      expect(output.widget).toBeDefined();
      core.events.emitSync('ui/update', { id: 'pb', value: 0.75 });
      // No throw means update was processed
    });

    it('warns for unknown id', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      core.events.emitSync('ui/update', { id: 'ghost', text: 'x' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ghost"'));
      warn.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // ui/get
  // -------------------------------------------------------------------------

  describe('ui/get', () => {
    it('returns the widget for a known id', () => {
      const { output: co } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'label', id: 'g1', text: '' },
      );
      const { output } = core.events.emitSync<UIGetParams, UIGetOutput>(
        'ui/get',
        { id: 'g1' },
      );
      expect(output.widget).toBe(co.widget);
    });

    it('returns undefined for an unknown id', () => {
      const { output } = core.events.emitSync<UIGetParams, UIGetOutput>(
        'ui/get',
        { id: 'missing' },
      );
      expect(output.widget).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // i18n integration
  // -------------------------------------------------------------------------

  describe('i18n/changed propagation', () => {
    it('calls onLocaleChanged on all widgets that implement it', () => {
      const onLocaleChanged = vi.fn();
      const factory: UIWidgetFactory = (_id, _props) => ({
        id: _id, type: 'i18nWidget',
        container: {
          x: 0, y: 0, visible: true,
          addChild: vi.fn(), removeChild: vi.fn(), getBounds: () => ({ width: 0, height: 0 }),
        } as unknown as import('pixi.js').Container,
        show: vi.fn(), hide: vi.fn(), destroy: vi.fn(),
        onLocaleChanged,
      });

      core.events.emitSync('ui/register', { type: 'i18nWidget', factory });
      core.events.emitSync('ui/create', { type: 'i18nWidget', id: 'iw1' });
      core.events.emitSync('ui/create', { type: 'i18nWidget', id: 'iw2' });

      core.events.emitSync('i18n/changed', { locale: 'zh-TW' });

      expect(onLocaleChanged).toHaveBeenCalledTimes(2);
      expect(onLocaleChanged).toHaveBeenCalledWith('zh-TW');
    });

    it('does not throw when a widget has no onLocaleChanged', () => {
      core.events.emitSync('ui/create', { type: 'panel', id: 'p1', width: 100, height: 50 });
      expect(() =>
        core.events.emitSync('i18n/changed', { locale: 'en' }),
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Direct API
  // -------------------------------------------------------------------------

  describe('direct API', () => {
    it('create() returns the widget', () => {
      const widget = ui.create({ type: 'label', id: 'direct1', text: 'hi' });
      expect(widget.id).toBe('direct1');
      expect(ui.has('direct1')).toBe(true);
    });

    it('show() / hide() via direct call', () => {
      ui.create({ type: 'label', id: 'direct2', text: '' });
      ui.hide('direct2');
      expect(ui.get('direct2')!.container.visible).toBe(false);
      ui.show('direct2');
      expect(ui.get('direct2')!.container.visible).toBe(true);
    });

    it('get() returns undefined for missing id', () => {
      expect(ui.get('nobody')).toBeUndefined();
    });

    it('has() reflects widget presence', () => {
      expect(ui.has('x')).toBe(false);
      ui.create({ type: 'label', id: 'x', text: '' });
      expect(ui.has('x')).toBe(true);
    });

    it('widgetCount increments and decrements correctly', () => {
      expect(ui.widgetCount).toBe(0);
      ui.create({ type: 'label', id: 'cnt1', text: '' });
      ui.create({ type: 'label', id: 'cnt2', text: '' });
      expect(ui.widgetCount).toBe(2);
      ui.destroyWidget('cnt1');
      expect(ui.widgetCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Anchor layout
  // -------------------------------------------------------------------------

  describe('anchor layout', () => {
    it('positions widget at x+offsetX when anchor is top-left', () => {
      const widget = ui.create({ type: 'label', id: 'al1', text: '', anchor: 'top-left', x: 10, y: 5 });
      // With top-left anchor: x = 0 + 10, y = 0 + 5
      expect(widget.container.x).toBe(10);
      expect(widget.container.y).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  describe('destroy (engine teardown)', () => {
    it('cleans up all widgets and removes namespace', () => {
      ui.create({ type: 'label', id: 'td1', text: '' });
      ui.create({ type: 'label', id: 'td2', text: '' });
      expect(ui.widgetCount).toBe(2);

      // destroy(core) is called in afterEach – but call it explicitly here
      // on a fresh manager to verify clean teardown
      const uiLayer2 = createUiLayerStub();
      const core2    = createCoreStub(uiLayer2);
      const ui2      = new UIManager();
      ui2.init(core2);
      ui2.create({ type: 'panel', id: 'p', width: 10, height: 10 });
      ui2.destroy(core2);
      expect(ui2.widgetCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // StackPanel widget
  // -------------------------------------------------------------------------

  describe('StackPanel widget', () => {
    it('addChild / removeChild reflowed without throwing', () => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'stack', id: 'sp1', direction: 'vertical', spacing: 4 },
      );
      const stack = output.widget as import('../src/types/ui.js').UIStackPanelWidget;

      const child = ui.create({ type: 'label', id: 'lbl_sp', text: 'child' });
      uiLayer.removeChild(child.container); // move ownership to stack

      stack.addChild(child);
      stack.removeChild('lbl_sp');
      expect(stack.container.children).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // ScrollView widget
  // -------------------------------------------------------------------------

  describe('ScrollView widget', () => {
    it('addChild / removeChild and setScroll work without throwing', () => {
      const { output } = core.events.emitSync<UICreateParams, UICreateOutput>(
        'ui/create',
        { type: 'scrollview', id: 'sv1', width: 300, height: 200 },
      );
      const sv = output.widget as import('../src/types/ui.js').UIScrollViewWidget;

      const child = ui.create({ type: 'label', id: 'lbl_sv', text: 'item' });
      uiLayer.removeChild(child.container);

      sv.addChild(child);
      sv.setScroll(0, -20);
      sv.removeChild('lbl_sv');
    });
  });
});

// ---------------------------------------------------------------------------
// Type aliases used in this file (imported from src/types/ui.ts)
// ---------------------------------------------------------------------------
type UICreateParams = import('../src/types/ui.js').UICreateParams;
type UIGetParams    = import('../src/types/ui.js').UIGetParams;
type UIRegisterParams = import('../src/types/ui.js').UIRegisterParams;
