import type { ScriptDef, ScriptNode } from '../../types/script.js';
import type { RmCommonEvent, RmEventCommand } from '../../types/rpgimporter.js';

// ---------------------------------------------------------------------------
// Command code mappings (RPG Maker MV/MZ)
// ---------------------------------------------------------------------------

const CODE_END = 0;
const CODE_SHOW_TEXT = 101;
const CODE_SHOW_CHOICES = 102;
const CODE_SHOW_CHOICES_RESULT = 402;
const CODE_CONDITIONAL_BRANCH = 111;
const CODE_ELSE = 411;
const CODE_LABEL = 118;
const CODE_JUMP_LABEL = 119;
const CODE_COMMON_EVENT = 117;
const CODE_WAIT = 230;
const CODE_SHOW_BALLOON = 213;
const CODE_PLAY_SE = 250;
const CODE_PLAY_BGM = 241;
const CODE_CHANGE_GOLD = 125;
const CODE_CHANGE_SWITCH = 121;
const CODE_CHANGE_VARIABLE = 122;

/**
 * Convert `CommonEvents.json` into engine {@link ScriptDef} objects.
 *
 * Only a representative subset of RPG Maker event commands is translated.
 * Unknown commands are emitted as `'rpgmaker/unknown-cmd'` nodes so that
 * the game can handle them at runtime or ignore them gracefully.
 */
export function parseCommonEvents(events: Array<RmCommonEvent | null>): ScriptDef[] {
  const result: ScriptDef[] = [];
  for (const evt of events) {
    if (!evt || evt.id === 0) continue;
    const nodes = convertCommandList(evt.list ?? []);
    result.push({ id: `common_event_${evt.id}`, nodes });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Internal translation
// ---------------------------------------------------------------------------

function convertCommandList(commands: RmEventCommand[]): ScriptNode[] {
  const nodes: ScriptNode[] = [];
  let i = 0;

  while (i < commands.length) {
    const cmd = commands[i];
    i++;

    switch (cmd.code) {
      case CODE_END:
        nodes.push({ cmd: 'end' });
        break;

      case CODE_SHOW_TEXT: {
        // Parameters: [face, faceIndex, background, position, speaker?]
        const speaker = (cmd.parameters[4] as string | undefined) ?? '';
        // Following lines (code 401) are continuation text
        let text = '';
        while (i < commands.length && commands[i].code === 401) {
          text += (commands[i].parameters[0] as string ?? '') + '\n';
          i++;
        }
        nodes.push({ cmd: 'say', text: text.trimEnd(), speaker });
        break;
      }

      case CODE_SHOW_CHOICES: {
        const choices = (cmd.parameters[0] as string[]) ?? [];
        const varName = 'choice_result';
        nodes.push({ cmd: 'choices', choices, var: varName });
        break;
      }

      case CODE_CONDITIONAL_BRANCH: {
        const varIdx = cmd.parameters[1] as number;
        const value = cmd.parameters[2] as unknown;
        nodes.push({ cmd: 'if', var: `switch_${varIdx}`, value, jump: `else_${i}` });
        break;
      }

      case CODE_LABEL:
        nodes.push({ cmd: 'label', name: cmd.parameters[0] as string });
        break;

      case CODE_JUMP_LABEL:
        nodes.push({ cmd: 'jump', target: cmd.parameters[0] as string });
        break;

      case CODE_WAIT:
        nodes.push({ cmd: 'wait', duration: ((cmd.parameters[0] as number) ?? 60) * (1000 / 60) });
        break;

      case CODE_COMMON_EVENT:
        nodes.push({ cmd: 'call', scriptId: `common_event_${cmd.parameters[0]}` });
        break;

      case CODE_PLAY_BGM: {
        const bgm = cmd.parameters[0] as { name: string; volume?: number } | undefined;
        if (bgm?.name) {
          nodes.push({ cmd: 'emit', event: 'audio/play', params: { key: bgm.name, category: 'bgm', volume: bgm.volume } });
        }
        break;
      }

      case CODE_PLAY_SE: {
        const se = cmd.parameters[0] as { name: string; volume?: number } | undefined;
        if (se?.name) {
          nodes.push({ cmd: 'emit', event: 'audio/play', params: { key: se.name, category: 'se', volume: se.volume } });
        }
        break;
      }

      case CODE_CHANGE_GOLD: {
        const isAdd = cmd.parameters[0] === 0;
        const amount = cmd.parameters[2] as number ?? 0;
        nodes.push({
          cmd: 'emit',
          event: 'store/patch',
          params: { namespace: 'player', patch: { _goldDelta: isAdd ? amount : -amount } },
        });
        break;
      }

      case CODE_CHANGE_SWITCH: {
        const start = cmd.parameters[0] as number;
        const value = cmd.parameters[3] === 0;
        nodes.push({ cmd: 'store-set', namespace: 'switches', key: `switch_${start}`, value });
        break;
      }

      case CODE_CHANGE_VARIABLE: {
        const varIndex = cmd.parameters[0] as number;
        const val = cmd.parameters[4] as unknown;
        nodes.push({ cmd: 'store-set', namespace: 'variables', key: `var_${varIndex}`, value: val });
        break;
      }

      case CODE_SHOW_CHOICES_RESULT:
      case CODE_ELSE:
        // Skip branch markers (they are implied by the 'if' / 'choices' nodes above)
        break;

      case CODE_SHOW_BALLOON:
        // Not translated — emit as unknown
        nodes.push({ cmd: 'rpgmaker/unknown-cmd', code: cmd.code, parameters: cmd.parameters });
        break;

      default:
        // Preserve unknown commands as pass-through nodes
        nodes.push({ cmd: 'rpgmaker/unknown-cmd', code: cmd.code, parameters: cmd.parameters });
    }
  }

  return nodes;
}
