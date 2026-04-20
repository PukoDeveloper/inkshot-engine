import type { DialogueTextSegment } from '../types/dialogue.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A colour-annotated range over a plain text string. */
export interface ColorSpan {
  readonly start: number;
  readonly end: number;
  /** Pixi hex colour (e.g. `0xff0000`). */
  readonly color: number;
}

/** A typewriter-speed override range over a plain text string. */
export interface SpeedSpan {
  readonly start: number;
  readonly end: number;
  /** Characters per second. */
  readonly speed: number;
}

/** A pause command inserted between characters. */
export interface PauseMark {
  /**
   * The typewriter pauses once `charIndex` reaches this value, i.e. after
   * this many characters have been revealed.
   */
  readonly afterIndex: number;
  /** Duration in milliseconds. */
  readonly ms: number;
}

/** Result of {@link parseDialogueMarkup}. */
export interface ParsedMarkup {
  /** Plain text with all markup tags stripped. */
  readonly plain: string;
  /** Colour ranges over `plain`. */
  readonly colorSpans: ReadonlyArray<ColorSpan>;
  /** Speed-override ranges over `plain`. */
  readonly speedSpans: ReadonlyArray<SpeedSpan>;
  /** Inline pause commands. */
  readonly pauses: ReadonlyArray<PauseMark>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EMPTY_PARSED: ParsedMarkup = {
  plain: '',
  colorSpans: [],
  speedSpans: [],
  pauses: [],
};

/** Matches any `[tag content]` sequence where content contains no `[` or `]`. */
const TAG_RE = /\[([^\]\[]+)\]/g;

function parseHexColor(raw: string): number | undefined {
  const str = raw.trim().replace(/^#/, '');
  // Accept 3-digit or 6-digit hex
  if (!/^[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(str)) return undefined;
  const expanded = str.length === 3
    ? str.split('').map(c => c + c).join('')
    : str;
  return parseInt(expanded, 16);
}

// ---------------------------------------------------------------------------
// parseDialogueMarkup
// ---------------------------------------------------------------------------

/**
 * Parse a dialogue string that may contain inline markup tags and return the
 * stripped plain text together with styling metadata.
 *
 * ### Supported tags
 *
 * | Tag                          | Description                             |
 * |------------------------------|-----------------------------------------|
 * | `[c=#rrggbb]...[/c]`         | Inline colour (shorthand)               |
 * | `[color=#rrggbb]...[/color]` | Inline colour (long form)               |
 * | `[speed=n]...[/speed]`       | Typewriter speed override (chars / sec) |
 * | `[pause=n]`                  | Pause typewriter for `n` ms             |
 *
 * Unknown or malformed tags are silently ignored (and stripped from output).
 * Unclosed block tags are automatically closed at end-of-string.
 *
 * @example
 * ```ts
 * const result = parseDialogueMarkup(
 *   'She [speed=20]slowly said[/speed][pause=400][c=#ff4444]Danger![/c]'
 * );
 * // result.plain === 'She slowly saidDanger!'
 * ```
 */
export function parseDialogueMarkup(raw: string): ParsedMarkup {
  if (!raw) return EMPTY_PARSED;

  let plain = '';
  const colorSpans: ColorSpan[] = [];
  const speedSpans: SpeedSpan[] = [];
  const pauses: PauseMark[] = [];

  const colorStack: Array<{ color: number; startIndex: number }> = [];
  const speedStack: Array<{ speed: number; startIndex: number }> = [];

  let lastIndex = 0;

  for (const match of raw.matchAll(TAG_RE)) {
    // Flush plain text before this tag
    plain += raw.slice(lastIndex, match.index);
    lastIndex = match.index! + match[0].length;

    const tag = match[1]!.trim().toLowerCase();
    const plainPos = plain.length;

    if (tag.startsWith('c=') || tag.startsWith('color=')) {
      const hexStr = tag.slice(tag.indexOf('=') + 1).trim();
      const color = parseHexColor(hexStr);
      if (color !== undefined) {
        colorStack.push({ color, startIndex: plainPos });
      }
    } else if (tag === '/c' || tag === '/color') {
      const top = colorStack.pop();
      if (top !== undefined && plainPos > top.startIndex) {
        colorSpans.push({ start: top.startIndex, end: plainPos, color: top.color });
      }
    } else if (tag.startsWith('speed=')) {
      const speed = parseFloat(tag.slice(6));
      if (!isNaN(speed) && speed > 0) {
        speedStack.push({ speed, startIndex: plainPos });
      }
    } else if (tag === '/speed') {
      const top = speedStack.pop();
      if (top !== undefined && plainPos > top.startIndex) {
        speedSpans.push({ start: top.startIndex, end: plainPos, speed: top.speed });
      }
    } else if (tag.startsWith('pause=')) {
      const ms = parseFloat(tag.slice(6));
      if (!isNaN(ms) && ms > 0) {
        pauses.push({ afterIndex: plainPos, ms });
      }
    }
    // Unknown / malformed tags are silently dropped
  }

  // Flush remaining plain text
  plain += raw.slice(lastIndex);

  // Close unclosed color tags (treat end-of-string as close)
  while (colorStack.length > 0) {
    const top = colorStack.pop()!;
    if (plain.length > top.startIndex) {
      colorSpans.push({ start: top.startIndex, end: plain.length, color: top.color });
    }
  }

  // Close unclosed speed tags
  while (speedStack.length > 0) {
    const top = speedStack.pop()!;
    if (plain.length > top.startIndex) {
      speedSpans.push({ start: top.startIndex, end: plain.length, speed: top.speed });
    }
  }

  return { plain, colorSpans, speedSpans, pauses };
}

// ---------------------------------------------------------------------------
// buildTextSegments
// ---------------------------------------------------------------------------

/**
 * Build an array of styled {@link DialogueTextSegment}s for the *revealed*
 * portion of a parsed line (0..`charIndex` characters of `plain`).
 *
 * Adjacent characters with the same colour are merged into one segment.
 * The return value always has at least one element (even when `charIndex` is 0).
 *
 * @param plain      Plain text returned by {@link parseDialogueMarkup}.
 * @param charIndex  Number of characters currently revealed.
 * @param colorSpans Colour spans from {@link ParsedMarkup}.
 */
export function buildTextSegments(
  plain: string,
  charIndex: number,
  colorSpans: ReadonlyArray<ColorSpan>,
): ReadonlyArray<DialogueTextSegment> {
  const len = Math.min(charIndex, plain.length);

  if (len === 0) return [{ text: '' }];
  if (colorSpans.length === 0) return [{ text: plain.slice(0, len) }];

  // Build a per-character colour map (last span wins for overlapping ranges)
  const colors = new Array<number | undefined>(len).fill(undefined);
  for (const span of colorSpans) {
    const end = Math.min(span.end, len);
    for (let i = span.start; i < end; i++) {
      colors[i] = span.color;
    }
  }

  // RLE-compress into segments
  const result: DialogueTextSegment[] = [];
  let segStart = 0;
  for (let i = 1; i <= len; i++) {
    if (i === len || colors[i] !== colors[segStart]) {
      result.push({ text: plain.slice(segStart, i), color: colors[segStart] });
      segStart = i;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// getSpeedAtIndex
// ---------------------------------------------------------------------------

/**
 * Return the typewriter speed (chars / sec) for the character at `charIndex`.
 *
 * The last overlapping {@link SpeedSpan} wins.  Falls back to `defaultSpeed`
 * when no span covers the position.
 *
 * @param charIndex    Zero-based index of the character *about to be revealed*.
 * @param speedSpans   Speed spans from {@link ParsedMarkup}.
 * @param defaultSpeed Fallback speed in chars / sec.
 */
export function getSpeedAtIndex(
  charIndex: number,
  speedSpans: ReadonlyArray<SpeedSpan>,
  defaultSpeed: number,
): number {
  for (let i = speedSpans.length - 1; i >= 0; i--) {
    const span = speedSpans[i]!;
    if (charIndex >= span.start && charIndex < span.end) {
      return span.speed;
    }
  }
  return defaultSpeed;
}
