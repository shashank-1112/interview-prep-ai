import { Building2, ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import App from './App';
import { useAuth } from './auth/AuthContext';
import { authConfig } from './auth/config';
import { canManageLayout } from './auth/session';
import { cx } from './components/ui';
import { ApiLayoutRepository } from './repository/apiLayoutRepository';
import type { LayoutRepository } from './repository/LayoutRepository';
import { useLayoutStore } from './store/layoutStore';

/** Matches Shared.DTOs.Layout.PlannableExhibitionResponse. */
interface PlannableExhibition {
  exhibitionId: number;
  name: string;
  venueName: string;
  startDate: string;
  endDate: string;
  hasGround: boolean;
}

interface SelectedExhibition {
  exhibitionId: number;
  name: string;
  venueName: string;
}

/** Tab-scoped only (not localStorage) — a fresh tab always starts at the
 *  picker; refreshing the same tab mid-edit stays on the same exhibition.
 *  Stores name/venueName too (not just the id) so a refresh doesn't lose the
 *  "For: <exhibition>" hint in Generate Ground before a ground exists yet to
 *  read them back from. */
const SELECTED_KEY = 'gs_layout_selected_exhibition';

function readSelected(): SelectedExhibition | null {
  try {
    const raw = sessionStorage.getItem(SELECTED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SelectedExhibition> | null;
    return typeof parsed?.exhibitionId === 'number'
      ? { exhibitionId: parsed.exhibitionId, name: parsed.name ?? '', venueName: parsed.venueName ?? '' }
      : null;
  } catch {
    return null;
  }
}

function writeSelected(selected: SelectedExhibition | null): void {
  try {
    if (selected === null) sessionStorage.removeItem(SELECTED_KEY);
    else sessionStorage.setItem(SELECTED_KEY, JSON.stringify(selected));
  } catch {
    // Private mode / storage unavailable — picking still works, it just won't survive a refresh.
  }
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ExhibitionPicker({ onSelect }: { onSelect: (exhibition: PlannableExhibition) => void }) {
  const { authorizedFetch, logout } = useAuth();
  const [exhibitions, setExhibitions] = useState<PlannableExhibition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    authorizedFetch(`${authConfig.apiBaseUrl}/api/layout/exhibitions`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load exhibitions (${response.status}).`);
        }
        return (await response.json()) as PlannableExhibition[];
      })
      .then((list) => {
        if (!cancelled) setExhibitions(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-900">Plan a layout</h1>
          <button onClick={logout} className="text-xs font-medium text-slate-500 hover:text-slate-800">
            Sign out
          </button>
        </div>

        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {!exhibitions && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Loading upcoming exhibitions…
          </div>
        )}

        {exhibitions && exhibitions.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">No upcoming exhibitions to plan a layout for right now.</p>
        )}

        {exhibitions && exhibitions.length > 0 && (
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {exhibitions.map((exhibition) => (
              <li key={exhibition.exhibitionId}>
                <button
                  onClick={() => onSelect(exhibition)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-slate-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600" aria-hidden>
                    <Building2 size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{exhibition.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {exhibition.venueName} · {formatDate(exhibition.startDate)} – {formatDate(exhibition.endDate)}
                    </span>
                  </span>
                  <span
                    className={cx(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      exhibition.hasGround ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {exhibition.hasGround ? 'Open layout' : 'Create layout'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Sits inside <AuthGate>. Picks which exhibition's layout to work on, then
 * hands App a repository scoped to exactly that one — App/the store never
 * know exhibitions exist as a concept, they just get handed a repository.
 */
export default function PlannerRoot() {
  const { authorizedFetch, session } = useAuth();
  const [selected, setSelected] = useState<SelectedExhibition | null>(readSelected);

  // Keeps the store's exhibitionMeta (read by generateGroundLayout, shown in
  // GenerateGroundForm) in sync with whichever exhibition is picked —
  // including on mount, when `selected` is restored from sessionStorage
  // rather than coming from a fresh pick.
  useEffect(() => {
    useLayoutStore.getState().setExhibitionMeta(selected ? { name: selected.name, venueName: selected.venueName } : null);
  }, [selected]);

  // Same idea for role-gated editing — set once per session, read by every component that
  // hides/shows a mutating control. The backend enforces this independently either way.
  useEffect(() => {
    useLayoutStore.getState().setCanManageLayout(canManageLayout(session));
  }, [session]);

  const repository: LayoutRepository | null = useMemo(
    () => (selected === null ? null : new ApiLayoutRepository(selected.exhibitionId, authorizedFetch)),
    [selected, authorizedFetch],
  );

  if (selected === null || !repository) {
    return (
      <ExhibitionPicker
        onSelect={(exhibition) => {
          const next = { exhibitionId: exhibition.exhibitionId, name: exhibition.name, venueName: exhibition.venueName };
          writeSelected(next);
          setSelected(next);
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Its own strip above App's header, not layered over it — App's own
          header content (icon, exhibition name, save status) already fills
          that same left edge, so an absolute overlay there collided with it. */}
      <div className="flex shrink-0 items-center border-b border-slate-200 bg-white px-2 py-0.5">
        <button
          onClick={() => {
            writeSelected(null);
            setSelected(null);
          }}
          className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Choose a different exhibition"
        >
          <ChevronLeft size={12} aria-hidden /> Exhibitions
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {/* key={exhibitionId}: forces a full remount (fresh store, fresh undo
            history) when switching exhibitions, rather than trying to reuse
            state that belongs to a different layout entirely. */}
        <App key={selected.exhibitionId} repository={repository} />
      </div>
    </div>
  );
}
