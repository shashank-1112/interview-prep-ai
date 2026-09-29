import { Cloud, CloudCheck, CloudOff, Loader2 } from 'lucide-react';
import { useLayoutStore } from '../store/layoutStore';

export function SaveIndicator() {
  const status = useLayoutStore((s) => s.saveStatus);
  const error = useLayoutStore((s) => s.saveError);
  const map = {
    idle: { icon: <CloudCheck size={14} />, text: 'Saved', cls: 'text-slate-500' },
    saved: { icon: <CloudCheck size={14} />, text: 'Saved', cls: 'text-emerald-700' },
    dirty: { icon: <Cloud size={14} />, text: 'Unsaved changes', cls: 'text-amber-700' },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, text: 'Saving…', cls: 'text-slate-500' },
    error: { icon: <CloudOff size={14} />, text: 'Save failed', cls: 'text-red-700' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${map.cls}`} role="status" aria-live="polite" title={error ?? undefined} data-testid="save-status">
      {map.icon}
      {map.text}
    </span>
  );
}
