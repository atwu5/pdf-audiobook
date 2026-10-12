/**
 * 音色筛选与分组工具：
 * 设备上的音色列表可能包含大量「实际听起来相同」的选项
 * （联网音色失败时静默回退、同一系统的多个变体等），
 * 这里按语言分组，并为每组挑一个最可靠的默认音色。
 */

export function isNetworkVoice(v: SpeechSynthesisVoice): boolean {
  return !v.localService || /^google\b/i.test(v.name) || /online \(natural\)/i.test(v.name);
}

const CLASSIC_RE = /tingting|婷婷|meijia|美嘉|sin-?ji|sinji|huihui|慧慧|kangkang|康康|yaoyao|瑶瑶|yating|曉婷|jingping|精評|monica/i;
const NOVELTY_RE = /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|bad news|good news|jester|bells|organ|superstar|zarvox|trinoids|whisper|wobble)\b/i;
const NETWORK_NAME_RE = /^google\b/i;

export function langGroupKey(lang: string): string {
  const l = (lang || '').toLowerCase().replace('_', '-');
  if (l === 'zh-cn') return 'zh-CN';
  if (l === 'zh-tw') return 'zh-TW';
  if (l === 'zh-hk') return 'zh-HK';
  return l || 'unknown';
}

/** 可靠性评分：本地 > 经典系统音色 > 普通音色 > 联网音色 > 新奇变体音色 */
export function scoreVoice(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (v.localService) s += 20;
  if (NETWORK_NAME_RE.test(v.name)) s -= 30;
  if (CLASSIC_RE.test(v.name)) s += 100;
  if (NOVELTY_RE.test(v.name)) s -= 60;
  if (/enhanced|premium|elite/i.test(v.name)) s += 10;
  return s;
}

export function pickBestVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}
