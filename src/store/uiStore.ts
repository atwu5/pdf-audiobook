import { create } from 'zustand';

export interface ToastItem {
  id: number;
  text: string;
  type: 'info' | 'error' | 'warn';
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

interface UIState {
  toasts: ToastItem[];
  confirmState: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  toast: (text: string, type?: ToastItem['type']) => void;
  dismissToast: (id: number) => void;
  askConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  answerConfirm: (v: boolean) => void;
}

let toastId = 0;

export const useUI = create<UIState>()((set, get) => ({
  toasts: [],
  confirmState: null,

  toast: (text, type = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, type }] }));
    window.setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  askConfirm: (opts) => {
    // 防止并发确认框叠加：后来的直接顶掉前者（视为取消）
    get().confirmState?.resolve(false);
    return new Promise<boolean>((resolve) => {
      set({ confirmState: { ...opts, resolve } });
    });
  },
  answerConfirm: (v) => {
    const cs = get().confirmState;
    if (cs) {
      set({ confirmState: null });
      cs.resolve(v);
    }
  },
}));

export function toast(text: string, type: 'info' | 'error' | 'warn' = 'info') {
  useUI.getState().toast(text, type);
}

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  return useUI.getState().askConfirm(opts);
}
