import { Fragment } from 'react';
import { Kbd, Modal } from '../components/ui';
import { SHORTCUT_GROUPS } from '../hooks/shortcuts';

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard Shortcuts" description="Shortcuts are paused while typing in a field or when a dialog is open." onClose={onClose} size="lg">
      <div className="grid gap-6 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title} className={g.title === 'General' ? 'sm:row-span-2' : undefined}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</h3>
            <dl className="space-y-1.5">
              {g.items.map((it) => (
                <div key={it.desc + it.keys.join()} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-slate-700">{it.desc}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {it.keys.map((k, i) => (
                      <Fragment key={k + i}>
                        {i > 0 && <span className="text-xs text-slate-400">+</span>}
                        <Kbd>{k}</Kbd>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
