import { AlertTriangle } from 'lucide-react';
import { Button, Modal } from '../components/ui';
import { useLayoutStore } from '../store/layoutStore';

export function ConfirmDialog() {
  const req = useLayoutStore((s) => s.confirm);
  const resolve = useLayoutStore((s) => s.resolveConfirm);
  if (!req) return null;
  const danger = req.tone === 'danger';
  return (
    <Modal
      title={req.title}
      onClose={() => resolve(false)}
      size="sm"
      elevated
      role="alertdialog"
      footer={
        <>
          <Button onClick={() => resolve(false)}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => resolve(true)} data-autofocus>
            {req.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600" aria-hidden>
            <AlertTriangle size={18} />
          </span>
        )}
        <p className="text-sm text-slate-700">{req.message}</p>
      </div>
    </Modal>
  );
}
