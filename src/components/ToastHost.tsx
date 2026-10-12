import { useUI } from '../store/uiStore';
import { IconX } from './Icons';

export function ToastHost() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg ${
            t.type === 'error'
              ? 'bg-red-700/95 text-white'
              : t.type === 'warn'
                ? 'bg-amber-600/95 text-white'
                : 'bg-ink/90 text-paper'
          }`}
        >
          <span className="truncate">{t.text}</span>
          <button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => dismiss(t.id)} aria-label="关闭提示">
            <IconX width={14} height={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const cs = useUI((s) => s.confirmState);
  const answer = useUI((s) => s.answerConfirm);
  if (!cs) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4" onClick={() => answer(false)}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-base font-semibold text-ink">{cs.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-inkSoft">{cs.message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            className="rounded-lg px-4 py-2 text-sm text-inkSoft hover:bg-paperDeep"
            onClick={() => answer(false)}
          >
            {cs.cancelText ?? '取消'}
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm text-white ${cs.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:bg-accentDeep'}`}
            onClick={() => answer(true)}
          >
            {cs.confirmText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
