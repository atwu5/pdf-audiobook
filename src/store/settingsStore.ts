import { create } from 'zustand';
import { getSetting, setSetting } from '../db/database';

export interface SettingsState {
  hydrated: boolean;
  /** 全局默认音色 voiceURI（每本书的进度里还会各自保存一份） */
  voiceURI: string;
  rate: number;
  autoScroll: boolean;
  fontSize: number;
  lineHeight: number;
  update: (patch: Partial<Omit<SettingsState, 'hydrated' | 'update'>>) => void;
}

export const useSettings = create<SettingsState>()((set) => ({
  hydrated: false,
  voiceURI: '',
  rate: 1,
  autoScroll: true,
  fontSize: 19,
  lineHeight: 1.9,
  update: (patch) => {
    set(patch);
    for (const [k, v] of Object.entries(patch)) {
      void setSetting(k, v);
    }
  },
}));

export async function hydrateSettings(): Promise<void> {
  const [voiceURI, rate, autoScroll, fontSize, lineHeight] = await Promise.all([
    getSetting<string>('voiceURI', ''),
    getSetting<number>('rate', 1),
    getSetting<boolean>('autoScroll', true),
    getSetting<number>('fontSize', 19),
    getSetting<number>('lineHeight', 1.9),
  ]);
  useSettings.setState({ voiceURI, rate, autoScroll, fontSize, lineHeight, hydrated: true });
}
