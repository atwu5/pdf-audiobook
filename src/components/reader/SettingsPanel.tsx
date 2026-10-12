import { useMemo } from 'react';
import { usePlayer } from '../../store/playerStore';
import { useSettings } from '../../store/settingsStore';
import { useVoices } from '../../tts/useVoices';
import { isSpeechSupported } from '../../tts/speechEngine';
import { isNetworkVoice, langGroupKey, pickBestVoice } from '../../tts/voiceUtils';

const RATES = [0.75, 1, 1.25, 1.5, 2];

const GROUP_LABELS: Record<string, string> = {
  'zh-CN': '普通话 · 大陆',
  'zh-TW': '国语 · 台湾',
  'zh-HK': '粤语 · 香港',
};
const GROUP_ORDER = ['zh-CN', 'zh-TW', 'zh-HK'];

function langLabel(lang: string): string {
  const l = lang.toLowerCase().replace('_', '-');
  if (l === 'zh-cn') return '普通话';
  if (l === 'zh-tw') return '国语';
  if (l === 'zh-hk') return '粤语';
  return lang;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-inkSoft">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsPanel() {
  const { zhVoices, otherVoices, loaded } = useVoices();
  const rate = usePlayer((s) => s.rate);
  const voiceURI = usePlayer((s) => s.voiceURI);
  const appliedVoiceURI = usePlayer((s) => s.appliedVoiceURI);
  const playerState = usePlayer((s) => s.state);
  const setRate = usePlayer((s) => s.setRate);
  const setVoice = usePlayer((s) => s.setVoice);
  const forceApplyVoice = usePlayer((s) => s.forceApplyVoice);
  const autoScroll = usePlayer((s) => s.autoScroll);
  const setAutoScroll = usePlayer((s) => s.setAutoScroll);
  const previewVoice = usePlayer((s) => s.previewVoice);
  const fontSize = useSettings((s) => s.fontSize);
  const lineHeight = useSettings((s) => s.lineHeight);
  const updateSettings = useSettings((s) => s.update);

  // 中文音色按语言分组：普通话 / 国语 / 粤语 / 其他，避免混在一起分不清
  const zhGroups = useMemo(() => {
    const groups = new Map<string, SpeechSynthesisVoice[]>();
    for (const v of zhVoices) {
      const key = langGroupKey(v.lang);
      const arr = groups.get(key);
      if (arr) arr.push(v);
      else groups.set(key, [v]);
    }
    const keys = [...groups.keys()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return { keys, groups };
  }, [zhVoices]);

  const hasNetworkVoice = useMemo(
    () => zhVoices.some(isNetworkVoice) || otherVoices.some(isNetworkVoice),
    [zhVoices, otherVoices]
  );

  const renderVoiceList = (list: SpeechSynthesisVoice[], recommendName?: string) =>
    list.map((v) => (
      <div
        key={v.voiceURI}
        className={`flex items-center gap-1 rounded-lg pr-1.5 text-sm ${
          voiceURI === v.voiceURI ? 'bg-paperDeep' : 'hover:bg-paperDeep/60'
        }`}
      >
        <label
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-3 text-sm ${
            voiceURI === v.voiceURI ? 'text-accent' : 'text-ink'
          }`}
        >
          <input
            type="radio"
            name="voice"
            className="accent-accent"
            checked={voiceURI === v.voiceURI}
            onChange={() => setVoice(v, v.voiceURI)}
          />
          <span className="min-w-0 flex-1 truncate">{v.name}</span>
          {recommendName === v.name && (
            <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">推荐</span>
          )}
          {isNetworkVoice(v) && (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">需联网</span>
          )}
          <span className="shrink-0 text-xs text-inkSoft/70">{langLabel(v.lang)}</span>
        </label>
        <button
          title="试听"
          aria-label={`试听 ${v.name}`}
          onClick={() => previewVoice(v)}
          className="shrink-0 rounded-full p-1.5 text-inkSoft transition-colors hover:bg-ink/5 hover:text-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          </svg>
        </button>
      </div>
    ));

  return (
    <div className="pb-6">
      {!isSpeechSupported() && (
        <div className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          当前浏览器不支持 Web Speech API，无法朗读。
        </div>
      )}
      {isSpeechSupported() && !loaded && (
        <div className="mx-4 mt-4 rounded-lg bg-paperDeep px-3 py-2 text-sm text-inkSoft">
          正在加载本机音色列表…
        </div>
      )}
      {isSpeechSupported() && loaded && zhVoices.length === 0 && (
        <div className="mx-4 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          本机未检测到中文音色，可能无法朗读中文内容。可在系统设置中安装中文语音包后刷新页面。
        </div>
      )}

      <Section title="音色">
        <p className="mb-2 px-1 text-xs leading-relaxed text-inkSoft/80">
          每种语言只展示 1 个最可靠的音色，避免一堆听起来一样的选项；点右侧喇叭可试听，其余音色收在「更多音色」里。
        </p>
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {zhGroups.keys.map((key) => {
            const list = zhGroups.groups.get(key) ?? [];
            const best = pickBestVoice(list);
            const rest = list.filter((v) => v !== best);
            return (
              <div key={key}>
                <div className="mb-1 px-3 text-xs font-medium text-inkSoft">
                  {GROUP_LABELS[key] ?? `中文（${key}）`}
                  <span className="ml-1 text-inkSoft/60">{list.length} 个</span>
                </div>
                <div className="space-y-0.5">{renderVoiceList(best ? [best] : [], best?.name)}</div>
                {rest.length > 0 && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer px-3 py-1 text-xs text-inkSoft/80">
                      更多音色（{rest.length}，部分可能听起来相同）
                    </summary>
                    <div className="mt-1 space-y-0.5">{renderVoiceList(rest)}</div>
                  </details>
                )}
              </div>
            );
          })}
          {otherVoices.length > 0 && (
            <details>
              <summary className="cursor-pointer px-3 py-1.5 text-xs text-inkSoft">
                其他语言音色（{otherVoices.length}）
              </summary>
              <div className="mt-1 space-y-0.5">{renderVoiceList(otherVoices)}</div>
            </details>
          )}
          {loaded && zhVoices.length + otherVoices.length === 0 && (
            <p className="px-3 py-2 text-sm text-inkSoft">未检测到任何可用音色。</p>
          )}
        </div>
        {hasNetworkVoice && (
          <p className="mt-2 px-1 text-xs leading-relaxed text-amber-700/90">
            「需联网」的音色在断网或加载失败时会静默回退成同一个系统音色——听起来都一样通常是这个原因，建议优先用本地音色。
          </p>
        )}
        {/* 强制生效入口：选中的音色与实际出声的音色不一致时出现 */}
        {playerState !== 'idle' && voiceURI && voiceURI !== appliedVoiceURI && (
          <div className="mt-3 px-1">
            <button
              onClick={forceApplyVoice}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accentDeep"
            >
              立即生效
            </button>
            <p className="mt-1.5 text-center text-xs text-inkSoft/70">
              强制切换到新音色，并从当前句继续朗读
            </p>
          </div>
        )}
      </Section>

      <Section title="语速">
        <div className="flex flex-wrap gap-2">
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                rate === r
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-white text-ink hover:border-accent/50'
              }`}
            >
              {r}x
            </button>
          ))}
        </div>
      </Section>

      <Section title="排版">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-ink">字号</span>
              <span className="text-inkSoft">{fontSize}px</span>
            </div>
            <input
              type="range"
              className="seek"
              min={15}
              max={28}
              step={1}
              value={fontSize}
              style={{ ['--p' as string]: `${((fontSize - 15) / 13) * 100}%` }}
              onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-ink">行距</span>
              <span className="text-inkSoft">{lineHeight.toFixed(1)}</span>
            </div>
            <input
              type="range"
              className="seek"
              min={1.5}
              max={2.4}
              step={0.1}
              value={lineHeight}
              style={{ ['--p' as string]: `${((lineHeight - 1.5) / 0.9) * 100}%` }}
              onChange={(e) => updateSettings({ lineHeight: Number(e.target.value) })}
            />
          </div>
        </div>
      </Section>

      <Section title="跟随滚动">
        <label className="flex cursor-pointer items-center justify-between px-1 py-1 text-sm text-ink">
          <span>朗读时自动滚动到当前位置</span>
          <button
            role="switch"
            aria-checked={autoScroll}
            onClick={() => setAutoScroll(!autoScroll)}
            className={`relative h-6 w-11 rounded-full transition-colors ${autoScroll ? 'bg-accent' : 'bg-line'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                autoScroll ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </label>
      </Section>
    </div>
  );
}
