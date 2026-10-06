import { lazy, Suspense } from 'react';
import { useLayoutStore } from '../store/layoutStore';

// Every generator/edit form is its own lazy chunk — none of it is needed to paint the ground view.
const GenerateGroundForm = lazy(() => import('../forms/GenerateGroundForm'));
const GroundBoundaryForm = lazy(() => import('../forms/GroundBoundaryForm'));
const HangarForm = lazy(() => import('../forms/HangarForm'));
const GenerateStallsForm = lazy(() => import('../forms/GenerateStallsForm'));
const StallEditForm = lazy(() => import('../forms/StallEditForm'));
const AnnotationForm = lazy(() => import('../forms/AnnotationForm'));
const ShortcutsHelp = lazy(() => import('./ShortcutsHelp'));

export function ModalHost() {
  const modal = useLayoutStore((s) => s.modal);
  const close = useLayoutStore((s) => s.closeModal);
  const hasData = useLayoutStore((s) => s.data !== null);
  if (!modal) return null;
  if (!hasData && modal.kind !== 'generateGround' && modal.kind !== 'shortcuts') return null;

  let content: React.ReactNode;
  switch (modal.kind) {
    case 'generateGround':
      content = <GenerateGroundForm onClose={close} />;
      break;
    case 'groundBoundary':
      content = <GroundBoundaryForm onClose={close} />;
      break;
    case 'addHangar':
      content = <HangarForm hangarId={null} onClose={close} />;
      break;
    case 'editHangar':
      content = <HangarForm key={modal.hangarId} hangarId={modal.hangarId} onClose={close} />;
      break;
    case 'generateStalls':
      content = <GenerateStallsForm hangarId={modal.hangarId} onClose={close} />;
      break;
    case 'addStall':
      content = <StallEditForm mode="create" hangarId={modal.hangarId} onClose={close} />;
      break;
    case 'editStall':
      content = <StallEditForm key={modal.stallId} mode="edit" stallId={modal.stallId} onClose={close} />;
      break;
    case 'annotation':
      content = <AnnotationForm hangarId={modal.hangarId} annotationId={modal.annotationId} presetType={modal.presetType} onClose={close} />;
      break;
    case 'shortcuts':
      content = <ShortcutsHelp onClose={close} />;
      break;
  }
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20" role="status" aria-live="polite">
          <span className="rounded-md bg-white px-3 py-2 text-sm text-slate-600 shadow">Loading…</span>
        </div>
      }
    >
      {content}
    </Suspense>
  );
}
