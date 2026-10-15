import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultLayout } from '../domain/seed';
import GenerateStallsForm from '../forms/GenerateStallsForm';
import BulkActionsPanel from '../panels/BulkActionsPanel';
import { ConfirmDialog } from '../panels/ConfirmDialog';
import { MemoryLayoutRepository } from '../repository/memoryRepository';
import { resetLayoutStore, useLayoutStore } from '../store/layoutStore';

beforeEach(async () => {
  resetLayoutStore();
  await useLayoutStore.getState().init(new MemoryLayoutRepository(defaultLayout()));
});

describe('GenerateGroundForm', () => {
  it('labels sizes with the unit, defaults the grid to 1 and calls hangar sizes approximate', async () => {
    const GenerateGroundForm = (await import('../forms/GenerateGroundForm')).default;
    const user = userEvent.setup();
    render(<GenerateGroundForm onClose={() => {}} />);
    expect(screen.getByLabelText('Width (m)')).toHaveValue(60);
    expect(screen.getByLabelText('Length (m)')).toHaveValue(40);
    expect(screen.getByLabelText('Grid size (m)')).toHaveValue(1);
    expect(screen.getByLabelText('Approx hangar width (m)')).toHaveValue(27);
    expect(screen.getByLabelText('Approx hangar length (m)')).toHaveValue(17);
    await user.selectOptions(screen.getByLabelText('Unit'), 'feet');
    expect(screen.getByLabelText('Width (ft)')).toBeInTheDocument();
    expect(screen.getByLabelText('Approx hangar width (ft)')).toBeInTheDocument();
    // Auto-fit rounds down to whole units.
    await user.clear(screen.getByLabelText('Width (ft)'));
    await user.type(screen.getByLabelText('Width (ft)'), '61');
    await user.click(screen.getByRole('button', { name: 'Auto-fit size' }));
    expect(screen.getByLabelText('Approx hangar width (ft)')).toHaveValue(27);
  });
});

describe('EditGroundForm', () => {
  const load = async () => (await import('../forms/EditGroundForm')).default;

  it('resizes the ground in place, keeping hangars and stalls, as one undo step', async () => {
    const EditGroundForm = await load();
    const user = userEvent.setup();
    const onClose = vi.fn();
    const before = useLayoutStore.getState().data!;
    render(<EditGroundForm onClose={onClose} />);
    expect(screen.getByLabelText('Width (m)')).toHaveValue(60);
    expect(screen.getByLabelText('Length (m)')).toHaveValue(40);
    expect(screen.getByLabelText('Grid size (m)')).toHaveValue(0.5);
    expect(screen.getByText(/at least 48 × 36 m/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Width (m)'));
    await user.type(screen.getByLabelText('Width (m)'), '75');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onClose).toHaveBeenCalled();
    const after = useLayoutStore.getState().data!;
    expect(after.ground).toMatchObject({ width: 75, height: 40 });
    expect(after.hangars).toEqual(before.hangars);
    expect(after.stalls).toEqual(before.stalls);
    useLayoutStore.getState().undo();
    expect(useLayoutStore.getState().data!.ground.width).toBe(60);
  });

  it('shows why a size is refused, on the field that is too small', async () => {
    const EditGroundForm = await load();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EditGroundForm onClose={onClose} />);
    await user.clear(screen.getByLabelText('Length (m)'));
    await user.type(screen.getByLabelText('Length (m)'), '30');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Hangar B would be cut off/)).toBeInTheDocument();
    expect(screen.getByLabelText('Length (m)')).toHaveAttribute('aria-invalid', 'true');
    expect(onClose).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().data!.ground.height).toBe(40);
  });
});

describe('SpaceHangarsForm', () => {
  const load = async () => (await import('../forms/SpaceHangarsForm')).default;

  it('starts from the current gaps, previews the move, and applies it as one undo step', async () => {
    const SpaceHangarsForm = await load();
    const user = userEvent.setup();
    const onClose = vi.fn();
    const before = useLayoutStore.getState().data!;
    render(<SpaceHangarsForm onClose={onClose} />);
    expect(screen.getByLabelText('Gap between hangars side by side (m)')).toHaveValue(2);
    expect(screen.getByLabelText('Gap between rows (m)')).toHaveValue(2);
    expect(screen.getByTestId('spacing-summary')).toHaveTextContent('No change');
    await user.clear(screen.getByLabelText('Gap between hangars side by side (m)'));
    await user.type(screen.getByLabelText('Gap between hangars side by side (m)'), '6');
    expect(screen.getByTestId('spacing-summary')).toHaveTextContent('1 hangar will move, with their stalls.');
    await user.click(screen.getByRole('button', { name: 'Apply spacing' }));
    expect(onClose).toHaveBeenCalled();
    const after = useLayoutStore.getState().data!;
    expect(after.hangars.find((h) => h.code === 'H-C')).toMatchObject({ x: 32, y: 2 });
    expect(after.stalls).toEqual(before.stalls);
    useLayoutStore.getState().undo();
    expect(useLayoutStore.getState().data!.hangars.find((h) => h.code === 'H-C')!.x).toBe(28);
  });

  it('explains a refused spacing and blocks applying it', async () => {
    const SpaceHangarsForm = await load();
    const user = userEvent.setup();
    render(<SpaceHangarsForm onClose={() => {}} />);
    await user.clear(screen.getByLabelText('Gap between rows (m)'));
    await user.type(screen.getByLabelText('Gap between rows (m)'), '9');
    expect(screen.getByTestId('spacing-summary')).toHaveTextContent(/Hangar B would go past the ground edge/);
    expect(screen.getByRole('button', { name: 'Apply spacing' })).toBeDisabled();
  });
});

describe('GenerateStallsForm', () => {
  it('auto-fills the max grid that fits and generates stalls', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GenerateStallsForm hangarId={3} onClose={onClose} />);
    await user.click(screen.getByText('Grid', { exact: true }));
    // Hangar C already has stalls at the top; start below them.
    await user.clear(screen.getByLabelText('Start Y'));
    await user.type(screen.getByLabelText('Start Y'), '11');
    await user.clear(screen.getByLabelText('Prefix'));
    await user.type(screen.getByLabelText('Prefix'), 'N');
    await user.click(screen.getByRole('button', { name: 'Auto-fill max' }));
    expect(screen.getByLabelText('Rows')).toHaveValue(1);
    expect(screen.getByLabelText('Columns')).toHaveValue(5);
    await user.click(screen.getByRole('button', { name: 'Generate 5 stalls' }));
    expect(onClose).toHaveBeenCalled();
    expect(useLayoutStore.getState().data!.stalls.filter((s) => s.stallNo.startsWith('N-'))).toHaveLength(5);
  });

  it('shows validation errors from the zod schema', async () => {
    const user = userEvent.setup();
    render(<GenerateStallsForm hangarId={1} onClose={() => {}} />);
    await user.click(screen.getByText('Grid', { exact: true }));
    await user.clear(screen.getByLabelText('Rows'));
    await user.click(screen.getByRole('button', { name: /Generate/ }));
    expect(await screen.findByText('Required.')).toBeInTheDocument();
  });

  it('switches the size preset to Custom when dimensions are edited', async () => {
    const user = userEvent.setup();
    render(<GenerateStallsForm hangarId={1} onClose={() => {}} />);
    await user.click(screen.getByText('Grid', { exact: true }));
    await user.selectOptions(screen.getByLabelText('Size preset'), '2×4');
    expect(screen.getByLabelText('Width')).toHaveValue(2);
    expect(screen.getByLabelText('Length')).toHaveValue(4);
    await user.type(screen.getByLabelText('Width'), '5');
    expect(screen.getByLabelText('Size preset')).toHaveValue('Custom');
  });
});

describe('BulkActionsPanel', () => {
  it('filters, paginates and applies a confirmed bulk price change', async () => {
    const user = userEvent.setup();
    const data = useLayoutStore.getState().data!;
    render(
      <>
        <BulkActionsPanel data={data} />
        <ConfirmDialog />
      </>,
    );
    expect(screen.getByText('42 of 42 stalls')).toBeInTheDocument();
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Stall type'), 'VIP');
    expect(screen.getByText('2 of 42 stalls')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Select all stalls on this page'));
    await user.selectOptions(screen.getByLabelText('Bulk action', { selector: 'select' }), 'price');
    await user.type(screen.getByLabelText('New final price'), '99000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/2 stall/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    const vip = useLayoutStore.getState().data!.stalls.filter((s) => s.stallType === 'VIP');
    expect(vip.map((s) => s.finalPrice)).toEqual([99000, 99000]);
  });
});

describe('AnnotationForm (roads & parking)', () => {
  it('adds a road beside the chosen side with length/width fields', async () => {
    const { default: AnnotationForm } = await import('../forms/AnnotationForm');
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AnnotationForm hangarId={null} annotationId={null} presetType="road" onClose={onClose} />);
    expect(screen.getByLabelText('Length along side (m)')).toHaveValue(60);
    await user.selectOptions(screen.getByLabelText('Beside which side'), 'left');
    expect(screen.getByLabelText('Length along side (m)')).toHaveValue(40);
    await user.clear(screen.getByLabelText('Road width (m)'));
    await user.type(screen.getByLabelText('Road width (m)'), '8');
    await user.click(screen.getByRole('button', { name: 'Add road' }));
    expect(onClose).toHaveBeenCalled();
    expect(useLayoutStore.getState().data!.annotations[0]).toMatchObject({ type: 'road', x: -8, y: 0, width: 8, height: 40 });
  });

  it('offers inside/outside placement for parking and shows capacity', async () => {
    const { default: AnnotationForm } = await import('../forms/AnnotationForm');
    const user = userEvent.setup();
    render(<AnnotationForm hangarId={null} annotationId={null} presetType="parking" onClose={() => {}} />);
    expect(screen.getByLabelText('Outside the ground')).toBeChecked();
    expect(screen.getByText(/≈ 9 cars/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Inside the ground'));
    expect(screen.queryByLabelText('Beside which side')).not.toBeInTheDocument();
  });

  it('hides roads and parking for hangar-scoped markers', async () => {
    const { default: AnnotationForm } = await import('../forms/AnnotationForm');
    render(<AnnotationForm hangarId={1} annotationId={null} onClose={() => {}} />);
    expect(screen.queryByText('Road')).not.toBeInTheDocument();
    expect(screen.queryByText('Parking Area')).not.toBeInTheDocument();
    expect(screen.getByText('Ticketing Counter')).toBeInTheDocument();
  });
});

describe('AnnotationForm review regressions', () => {
  const load = async () => (await import('../forms/AnnotationForm')).default;

  it('focuses the Label field, not an unchecked type radio', async () => {
    const AnnotationForm = await load();
    render(<AnnotationForm hangarId={null} annotationId={null} presetType="road" onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Label'));
  });

  it('a hidden invalid gap does not block submit', async () => {
    const AnnotationForm = await load();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AnnotationForm hangarId={null} annotationId={null} presetType="parking" onClose={onClose} />);
    await user.clear(screen.getByLabelText('Gap from ground edge (m)'));
    await user.click(screen.getByLabelText('Inside the ground'));
    await user.click(screen.getByRole('button', { name: 'Add parking' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('edits a vertical road with length/width matching its long axis, errors on the right field', async () => {
    const { saveAnnotation } = await import('../store/actions');
    saveAnnotation(null, null, { type: 'road', label: 'West Rd', width: 6, height: 40, placement: 'outside', side: 'left', gap: 0 });
    const AnnotationForm = await load();
    const user = userEvent.setup();
    render(<AnnotationForm hangarId={null} annotationId={1} onClose={() => {}} />);
    expect(screen.getByLabelText('Length along side (m)')).toHaveValue(40);
    expect(screen.getByLabelText('Road width (m)')).toHaveValue(6);
    await user.clear(screen.getByLabelText('Length along side (m)'));
    await user.type(screen.getByLabelText('Length along side (m)'), '1000');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const lengthField = screen.getByLabelText('Length along side (m)');
    expect(lengthField).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Road width (m)')).not.toHaveAttribute('aria-invalid');
  });

  it('switching an existing left road to parking keeps its footprint', async () => {
    const { saveAnnotation } = await import('../store/actions');
    saveAnnotation(null, null, { type: 'road', label: 'West Rd', width: 6, height: 40, placement: 'outside', side: 'left', gap: 0 });
    const AnnotationForm = await load();
    const user = userEvent.setup();
    render(<AnnotationForm hangarId={null} annotationId={1} onClose={() => {}} />);
    await user.click(screen.getByText('Parking Area'));
    expect(screen.getByLabelText('Width (m)')).toHaveValue(6);
    expect(screen.getByLabelText('Length (m)')).toHaveValue(40);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useLayoutStore.getState().data!.annotations[0]).toMatchObject({ type: 'parking', x: -6, y: 0, width: 6, height: 40 });
  });

  it('offers gift counter and washroom with inside/outside placement, also in hangars', async () => {
    const AnnotationForm = await load();
    const user = userEvent.setup();
    const { unmount } = render(<AnnotationForm hangarId={null} annotationId={null} onClose={() => {}} />);
    await user.click(screen.getByText('Gift Counter'));
    expect(screen.getByLabelText('Inside the ground')).toBeChecked();
    await user.click(screen.getByText('Washroom'));
    expect(screen.getByLabelText('Width (m)')).toHaveValue(4);
    unmount();
    render(<AnnotationForm hangarId={1} annotationId={null} onClose={() => {}} />);
    expect(screen.getByText('Gift Counter')).toBeInTheDocument();
    expect(screen.getByText('Washroom')).toBeInTheDocument();
    expect(screen.queryByLabelText('Inside the ground')).not.toBeInTheDocument();
  });
});


describe('Generate Stalls — staggered islands (default)', () => {
  it('opens on the staggered layout and generates it', async () => {
    const { addHangar } = await import('../store/actions');
    addHangar({ name: 'Hangar D', code: 'H-D', x: 28, y: 18, width: 24, height: 20 });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GenerateStallsForm hangarId={4} onClose={onClose} />);
    expect(screen.getByRole('radio', { name: /Staggered islands/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Bottom wall' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Right wall' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('Centre islands (back-to-back)')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-summary')).toHaveTextContent('30 stalls — top 8 · bottom 5 · left 5 · 2 islands (12)');
    await user.click(screen.getByRole('button', { name: 'Generate 30 stalls' }));
    expect(onClose).toHaveBeenCalled();
    expect(useLayoutStore.getState().data!.stalls.filter((s) => s.hangarId === 4)).toHaveLength(30);
  });
});

describe('Generate Stalls — walls + islands layout (whiteboard sketch)', () => {
  it('stalls along the walls + a centre island, with a live preview', async () => {
    const { addHangar } = await import('../store/actions');
    addHangar({ name: 'Hangar D', code: 'H-D', x: 28, y: 18, width: 24, height: 20 });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GenerateStallsForm hangarId={4} onClose={onClose} />);
    // Picking the pattern resets the wall toggles to its own defaults (top, right, left).
    await user.click(screen.getByRole('radio', { name: /Along walls \+ islands/ }));
    expect(screen.getByTestId('plan-summary')).toHaveTextContent('24 stalls — top 8 · right 5 · left 5 · 1 island (6)');
    expect(screen.getByLabelText('Frontage (along aisle)')).toHaveValue(3);
    // Turning the bottom wall on adds a bottom row and shrinks the side columns.
    await user.click(screen.getByRole('button', { name: 'Bottom wall' }));
    expect(screen.getByTestId('plan-summary')).toHaveTextContent('top 8 · right 4 · bottom 8 · left 4');
    await user.click(screen.getByRole('button', { name: 'Bottom wall' }));
    await user.click(screen.getByRole('button', { name: 'Generate 24 stalls' }));
    expect(onClose).toHaveBeenCalled();
    const stalls = useLayoutStore.getState().data!.stalls.filter((s) => s.hangarId === 4);
    expect(stalls).toHaveLength(24);
    expect(stalls.find((s) => s.stallNo === 'D-02')!.openSides).toEqual(['bottom']);
    expect(stalls.find((s) => s.stallNo === 'D-01')!.openSides).toBeUndefined(); // boxed-in corner
  });

  it('asks for at least one wall or centre islands', async () => {
    const user = userEvent.setup();
    render(<GenerateStallsForm hangarId={1} onClose={() => {}} />);
    await user.click(screen.getByRole('radio', { name: /Along walls \+ islands/ }));
    for (const w of ['Top wall', 'Right wall', 'Left wall']) await user.click(screen.getByRole('button', { name: w }));
    await user.click(screen.getByLabelText('Centre islands (back-to-back)'));
    expect(screen.getByRole('button', { name: 'Generate 0 stalls' })).toBeDisabled();
  });
});

describe('Open sides', () => {
  it('the stall edit form lets you mark a side as an opening', async () => {
    const { default: StallEditForm } = await import('../forms/StallEditForm');
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StallEditForm mode="edit" stallId={1} onClose={onClose} />);
    const bottom = screen.getByRole('button', { name: 'Bottom side: wall' });
    await user.click(bottom);
    expect(screen.getByRole('button', { name: 'Bottom side: open' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onClose).toHaveBeenCalled();
    expect(useLayoutStore.getState().data!.stalls.find((s) => s.id === 1)!.openSides).toEqual(['bottom']);
  });
});

describe('AnnotationForm — orientation & labels (review 2)', () => {
  const load = async () => (await import('../forms/AnnotationForm')).default;

  it('switching to Road uses the chosen side for "Length along side"', async () => {
    const AnnotationForm = await load();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AnnotationForm hangarId={null} annotationId={null} presetType="parking" onClose={onClose} />);
    await user.selectOptions(screen.getByLabelText('Beside which side'), 'left');
    await user.clear(screen.getByLabelText('Width (m)'));
    await user.type(screen.getByLabelText('Width (m)'), '6');
    await user.clear(screen.getByLabelText('Length (m)'));
    await user.type(screen.getByLabelText('Length (m)'), '40');
    await user.click(screen.getByText('Road', { exact: true }));
    expect(screen.getByLabelText('Length along side (m)')).toHaveValue(40);
    expect(screen.getByLabelText('Road width (m)')).toHaveValue(6);
    await user.click(screen.getByRole('button', { name: 'Add road' }));
    expect(useLayoutStore.getState().data!.annotations[0]).toMatchObject({ x: -6, width: 6, height: 40 });
  });

  it('changing side away and back does not rotate a spur road', async () => {
    useLayoutStore.getState().commit((d) => ({ ...d, annotations: [{ id: 1, type: 'road', label: 'Spur', x: 10, y: -30, width: 6, height: 30, hangarId: null }] }));
    const AnnotationForm = await load();
    const user = userEvent.setup();
    render(<AnnotationForm hangarId={null} annotationId={1} onClose={() => {}} />);
    await user.selectOptions(screen.getByLabelText('Beside which side'), 'left');
    await user.selectOptions(screen.getByLabelText('Beside which side'), 'top');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useLayoutStore.getState().data!.annotations[0]).toMatchObject({ x: 10, y: -30, width: 6, height: 30 });
  });

  it('an auto-filled type name follows a type change', async () => {
    const { saveAnnotation } = await import('../store/actions');
    saveAnnotation(1, null, { type: 'washroom', label: '', width: 4, height: 3, placement: 'inside', side: 'top', gap: 0 });
    const AnnotationForm = await load();
    const user = userEvent.setup();
    render(<AnnotationForm hangarId={1} annotationId={1} onClose={() => {}} />);
    expect(screen.getByLabelText('Label')).toHaveValue('');
    await user.click(screen.getByText('Gift Counter'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(useLayoutStore.getState().data!.annotations[0]).toMatchObject({ type: 'gift-counter', label: 'Gift Counter' });
  });

  it('shows the no-room error in the form instead of closing', async () => {
    const AnnotationForm = await load();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AnnotationForm hangarId={null} annotationId={null} onClose={onClose} />);
    await user.click(screen.getByText('Washroom'));
    await user.clear(screen.getByLabelText('Width (m)'));
    await user.type(screen.getByLabelText('Width (m)'), '12');
    await user.clear(screen.getByLabelText('Length (m)'));
    await user.type(screen.getByLabelText('Length (m)'), '25');
    await user.click(screen.getByRole('button', { name: 'Add marker' }));
    expect(await screen.findByText(/No free space inside the ground/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
