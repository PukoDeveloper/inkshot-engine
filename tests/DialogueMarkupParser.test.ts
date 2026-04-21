import { describe, it, expect } from 'vitest';
import {
  parseDialogueMarkup,
  buildTextSegments,
  getSpeedAtIndex,
} from '../src/plugins/rpg/DialogueMarkupParser.js';

// ---------------------------------------------------------------------------
// parseDialogueMarkup
// ---------------------------------------------------------------------------

describe('parseDialogueMarkup', () => {
  describe('basic text (no markup)', () => {
    it('returns empty plain when raw is empty', () => {
      const r = parseDialogueMarkup('');
      expect(r.plain).toBe('');
      expect(r.colorSpans).toHaveLength(0);
      expect(r.speedSpans).toHaveLength(0);
      expect(r.pauses).toHaveLength(0);
    });

    it('returns the original string when there are no tags', () => {
      const r = parseDialogueMarkup('Hello world!');
      expect(r.plain).toBe('Hello world!');
      expect(r.colorSpans).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Color tags
  // -------------------------------------------------------------------------

  describe('[c=…] / [color=…] tags', () => {
    it('strips the tag and records a color span (shorthand)', () => {
      const r = parseDialogueMarkup('[c=#ff0000]red[/c]');
      expect(r.plain).toBe('red');
      expect(r.colorSpans).toHaveLength(1);
      expect(r.colorSpans[0]).toMatchObject({ start: 0, end: 3, color: 0xff0000 });
    });

    it('strips the tag and records a color span (long form)', () => {
      const r = parseDialogueMarkup('[color=#00ff00]green[/color]');
      expect(r.plain).toBe('green');
      expect(r.colorSpans[0]).toMatchObject({ start: 0, end: 5, color: 0x00ff00 });
    });

    it('accepts 3-digit hex', () => {
      const r = parseDialogueMarkup('[c=#f00]red[/c]');
      expect(r.plain).toBe('red');
      expect(r.colorSpans[0]!.color).toBe(0xff0000);
    });

    it('is case-insensitive for tag names', () => {
      const r = parseDialogueMarkup('[C=#ff0000]R[/C]');
      expect(r.plain).toBe('R');
      expect(r.colorSpans).toHaveLength(1);
    });

    it('handles colour in the middle of a string', () => {
      const r = parseDialogueMarkup('Hello [c=#ff4400]world[/c]!');
      expect(r.plain).toBe('Hello world!');
      expect(r.colorSpans[0]).toMatchObject({ start: 6, end: 11, color: 0xff4400 });
    });

    it('handles adjacent color spans', () => {
      const r = parseDialogueMarkup('[c=#f00]A[/c][c=#0f0]B[/c]');
      expect(r.plain).toBe('AB');
      expect(r.colorSpans).toHaveLength(2);
      expect(r.colorSpans[0]).toMatchObject({ start: 0, end: 1, color: 0xff0000 });
      expect(r.colorSpans[1]).toMatchObject({ start: 1, end: 2, color: 0x00ff00 });
    });

    it('auto-closes unclosed color tag at end-of-string', () => {
      const r = parseDialogueMarkup('[c=#ff0000]forever red');
      expect(r.plain).toBe('forever red');
      expect(r.colorSpans[0]).toMatchObject({ start: 0, end: 11, color: 0xff0000 });
    });

    it('silently drops close tag without matching open', () => {
      const r = parseDialogueMarkup('text[/c]more');
      expect(r.plain).toBe('textmore');
      expect(r.colorSpans).toHaveLength(0);
    });

    it('ignores malformed hex color (letters out of range)', () => {
      const r = parseDialogueMarkup('[c=#gghhii]text[/c]');
      expect(r.plain).toBe('text');
      expect(r.colorSpans).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Speed tags
  // -------------------------------------------------------------------------

  describe('[speed=n] tags', () => {
    it('strips the tag and records a speed span', () => {
      const r = parseDialogueMarkup('[speed=200]fast[/speed]');
      expect(r.plain).toBe('fast');
      expect(r.speedSpans).toHaveLength(1);
      expect(r.speedSpans[0]).toMatchObject({ start: 0, end: 4, speed: 200 });
    });

    it('handles speed tag in the middle of a string', () => {
      const r = parseDialogueMarkup('normal [speed=0.5]slow[/speed] back');
      expect(r.plain).toBe('normal slow back');
      expect(r.speedSpans[0]).toMatchObject({ start: 7, end: 11, speed: 0.5 });
    });

    it('ignores speed ≤ 0', () => {
      const r = parseDialogueMarkup('[speed=0]text[/speed]');
      expect(r.plain).toBe('text');
      expect(r.speedSpans).toHaveLength(0);
    });

    it('auto-closes unclosed speed tag at end-of-string', () => {
      const r = parseDialogueMarkup('[speed=50]slow forever');
      expect(r.speedSpans[0]).toMatchObject({ start: 0, end: 12, speed: 50 });
    });
  });

  // -------------------------------------------------------------------------
  // Pause tags
  // -------------------------------------------------------------------------

  describe('[pause=n] tags', () => {
    it('records a pause at the current position', () => {
      const r = parseDialogueMarkup('Hello[pause=300] world');
      expect(r.plain).toBe('Hello world');
      expect(r.pauses).toHaveLength(1);
      expect(r.pauses[0]).toMatchObject({ afterIndex: 5, ms: 300 });
    });

    it('records multiple pauses', () => {
      const r = parseDialogueMarkup('A[pause=100]B[pause=200]C');
      expect(r.pauses).toHaveLength(2);
      expect(r.pauses[0]).toMatchObject({ afterIndex: 1, ms: 100 });
      expect(r.pauses[1]).toMatchObject({ afterIndex: 2, ms: 200 });
    });

    it('ignores pause with ms ≤ 0', () => {
      const r = parseDialogueMarkup('A[pause=0]B');
      expect(r.pauses).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown / unrecognised tags
  // -------------------------------------------------------------------------

  describe('unknown tags', () => {
    it('silently drops unknown open tags', () => {
      const r = parseDialogueMarkup('[bold]text[/bold]');
      expect(r.plain).toBe('text');
      expect(r.colorSpans).toHaveLength(0);
      expect(r.speedSpans).toHaveLength(0);
    });

    it('silently drops self-closing unknown tags', () => {
      const r = parseDialogueMarkup('A[wave]B');
      expect(r.plain).toBe('AB');
    });
  });

  // -------------------------------------------------------------------------
  // Combined markup
  // -------------------------------------------------------------------------

  describe('combined markup', () => {
    it('handles color + speed + pause in the same string', () => {
      const r = parseDialogueMarkup('[speed=20]slow[/speed][pause=500][c=#ff0000]red[/c]');
      expect(r.plain).toBe('slowred');
      expect(r.speedSpans[0]).toMatchObject({ start: 0, end: 4, speed: 20 });
      expect(r.pauses[0]).toMatchObject({ afterIndex: 4, ms: 500 });
      expect(r.colorSpans[0]).toMatchObject({ start: 4, end: 7, color: 0xff0000 });
    });
  });
});

// ---------------------------------------------------------------------------
// buildTextSegments
// ---------------------------------------------------------------------------

describe('buildTextSegments', () => {
  it('returns a single segment with no color when there are no color spans', () => {
    const segs = buildTextSegments('Hello', 5, []);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ text: 'Hello' });
  });

  it('returns empty-text segment when charIndex is 0', () => {
    const segs = buildTextSegments('Hello', 0, []);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.text).toBe('');
  });

  it('slices to the revealed portion only', () => {
    const segs = buildTextSegments('Hello', 3, []);
    expect(segs[0]!.text).toBe('Hel');
  });

  it('assigns color to characters within a color span', () => {
    const segs = buildTextSegments('ABCD', 4, [{ start: 0, end: 4, color: 0xff0000 }]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ text: 'ABCD', color: 0xff0000 });
  });

  it('splits into two segments at a color boundary', () => {
    const segs = buildTextSegments('ABCD', 4, [{ start: 2, end: 4, color: 0x0000ff }]);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ text: 'AB' });
    expect(segs[1]).toMatchObject({ text: 'CD', color: 0x0000ff });
  });

  it('only covers the revealed portion when charIndex is inside a color span', () => {
    // color span covers [2, 4) but only 3 chars revealed → only 1 coloured char
    const segs = buildTextSegments('ABCD', 3, [{ start: 2, end: 4, color: 0xff0000 }]);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ text: 'AB' });
    expect(segs[1]).toMatchObject({ text: 'C', color: 0xff0000 });
  });

  it('later span wins when spans overlap', () => {
    // Both spans cover index 1; second span (0x0000ff) wins
    const segs = buildTextSegments('AB', 2, [
      { start: 0, end: 2, color: 0xff0000 },
      { start: 1, end: 2, color: 0x0000ff },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ text: 'A', color: 0xff0000 });
    expect(segs[1]).toMatchObject({ text: 'B', color: 0x0000ff });
  });
});

// ---------------------------------------------------------------------------
// getSpeedAtIndex
// ---------------------------------------------------------------------------

describe('getSpeedAtIndex', () => {
  it('returns defaultSpeed when there are no speed spans', () => {
    expect(getSpeedAtIndex(0, [], 40)).toBe(40);
  });

  it('returns the span speed when the index is within a span', () => {
    const spans = [{ start: 2, end: 6, speed: 200 }];
    expect(getSpeedAtIndex(3, spans, 40)).toBe(200);
  });

  it('returns defaultSpeed when the index is before a span', () => {
    const spans = [{ start: 2, end: 6, speed: 200 }];
    expect(getSpeedAtIndex(1, spans, 40)).toBe(40);
  });

  it('returns defaultSpeed when the index is at or after span end', () => {
    const spans = [{ start: 2, end: 6, speed: 200 }];
    expect(getSpeedAtIndex(6, spans, 40)).toBe(40);
  });

  it('last overlapping span wins when multiple spans cover the same index', () => {
    const spans = [
      { start: 0, end: 4, speed: 100 },
      { start: 2, end: 4, speed: 300 },
    ];
    expect(getSpeedAtIndex(2, spans, 40)).toBe(300);
  });
});
