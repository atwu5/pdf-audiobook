import { useEffect, useMemo, useState } from 'react';
import { isCuratedVoice } from './voiceUtils';

export interface VoiceGroups {
  zhVoices: SpeechSynthesisVoice[];
  otherVoices: SpeechSynthesisVoice[];
  allVoices: SpeechSynthesisVoice[];
  loaded: boolean;
}

/**
 * 加载本机可用的语音列表，处理 voiceschanged 异步加载。
 * 音色可用性完全取决于设备/浏览器，不做任何「伪装音色」。
 */
export function useVoices(): VoiceGroups {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      const all = window.speechSynthesis.getVoices();
      if (!all.length) return;
      // 只保留精选音色（Google 國語臺灣 / 粤語香港）；设备上没有时回退全部，
      // 避免一堆实际发声相同的选项
      const curated = all.filter(isCuratedVoice);
      setVoices(curated.length ? curated : all);
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    // 某些浏览器首次为空，需要稍后重试
    const t1 = window.setTimeout(load, 300);
    const t2 = window.setTimeout(load, 1500);
    const t3 = window.setTimeout(load, 4000);
    return () => {
      cancelled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      [t1, t2, t3].forEach((t) => window.clearTimeout(t));
    };
  }, [supported]);

  return useMemo(() => {
    const zh = voices.filter((v) => v.lang?.toLowerCase().startsWith('zh'));
    const others = voices.filter((v) => !v.lang?.toLowerCase().startsWith('zh'));
    return { zhVoices: zh, otherVoices: others, allVoices: voices, loaded: voices.length > 0 };
  }, [voices]);
}
