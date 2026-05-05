'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { Button, toast } from '@hir/ui';
import { saveTablePlan } from './actions';

export type TableShape = 'rect' | 'round';

export type TablePlanItem = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  seats: number;
  label: string;
  shape: TableShape;
};

export type TablePlan = {
  tables: TablePlanItem[];
};

const CANVAS_W = 800;
const CANVAS_H = 500;
const GRID = 10;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function makeId(): string {
  // Short, human-friendly, stable: 't-' + 6-char random base36.
  return 't-' + Math.random().toString(36).slice(2, 8);
}

function nextLabel(tables: TablePlanItem[]): string {
  const used = new Set(tables.map((t) => t.label));
  for (let i = 1; i <= 999; i++) {
    const candidate = `Masa ${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `Masa ${tables.length + 1}`;
}

type DragMode = 'move' | 'resize';

type DragState = {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
};

export function TablePlanEditor({
  tenantId,
  initialPlan,
  initialShowToCustomers,
}: {
  tenantId: string;
  initialPlan: TablePlan;
  initialShowToCustomers: boolean;
}) {
  const [tables, setTables] = useState<TablePlanItem[]>(
    initialPlan.tables ?? [],
  );
  const [showToCustomers, setShowToCustomers] = useState(initialShowToCustomers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [dirty, setDirty] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  const markDirty = () => setDirty(true);

  const updateTable = useCallback(
    (id: string, patch: Partial<TablePlanItem>) => {
      setTables((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
      markDirty();
    },
    [],
  );

  const toSvgCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const onPointerDown = (
    e: React.PointerEvent<SVGElement>,
    id: string,
    mode: DragMode,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const t = tables.find((x) => x.id === id);
    if (!t) return;
    setSelectedId(id);
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    dragRef.current = {
      id,
      mode,
      startX: x,
      startY: y,
      origX: t.x,
      origY: t.y,
      origW: t.w,
      origH: t.h,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    const dx = x - d.startX;
    const dy = y - d.startY;
    if (d.mode === 'move') {
      const nx = snap(clamp(d.origX + dx, 0, CANVAS_W - 40));
      const ny = snap(clamp(d.origY + dy, 0, CANVAS_H - 40));
      updateTable(d.id, { x: nx, y: ny });
    } else {
      const nw = snap(clamp(d.origW + dx, 40, CANVAS_W - d.origX));
      const nh = snap(clamp(d.origH + dy, 40, CANVAS_H - d.origY));
      updateTable(d.id, { w: nw, h: nh });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGElement>) => {
    if (dragRef.current) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  };

  const onCanvasClick = () => {
    setSelectedId(null);
  };

  const addTable = () => {
    if (tables.length >= 200) {
      toast.error('Maxim 200 de mese.');
      return;
    }
    const t: TablePlanItem = {
      id: makeId(),
      x: snap(CANVAS_W / 2 - 40),
      y: snap(CANVAS_H / 2 - 40),
      w: 80,
      h: 80,
      seats: 4,
      label: nextLabel(tables),
      shape: 'rect',
    };
    setTables((prev) => [...prev, t]);
    setSelectedId(t.id);
    markDirty();
  };

  const removeTable = (id: string) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
    markDirty();
  };

  const onSave = () => {
    start(async () => {
      const r = await saveTablePlan({
        tenantId,
        showToCustomers,
        tables,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Plan salvat.');
      setDirty(false);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={addTable} disabled={busy}>
            + Adaugă masă
          </Button>
          <span className="text-xs text-zinc-500">
            {tables.length} {tables.length === 1 ? 'masă' : 'mese'}
          </span>
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-600"
            checked={showToCustomers}
            onChange={(e) => {
              setShowToCustomers(e.target.checked);
              markDirty();
            }}
          />
          <span className="font-medium text-zinc-700">
            Afișează planul mesei clienților pe /rezervari
          </span>
        </label>

        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={busy || !dirty}
        >
          {busy ? 'Se salvează…' : dirty ? 'Salvează' : 'Salvat'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Canvas */}
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className="block h-auto w-full touch-none select-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={onCanvasClick}
            role="application"
            aria-label="Editor plan mese"
          >
            {/* grid background */}
            <defs>
              <pattern
                id="grid-bg"
                width={GRID * 4}
                height={GRID * 4}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`}
                  fill="none"
                  stroke="rgb(228 228 231)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect
              x={0}
              y={0}
              width={CANVAS_W}
              height={CANVAS_H}
              fill="url(#grid-bg)"
            />

            {tables.map((t) => {
              const isSel = selectedId === t.id;
              return (
                <g
                  key={t.id}
                  onPointerDown={(e) => onPointerDown(e, t.id, 'move')}
                  className="cursor-move"
                >
                  {t.shape === 'round' ? (
                    <ellipse
                      cx={t.x + t.w / 2}
                      cy={t.y + t.h / 2}
                      rx={t.w / 2}
                      ry={t.h / 2}
                      fill={isSel ? 'rgb(254 243 199)' : 'rgb(255 255 255)'}
                      stroke={isSel ? 'rgb(217 119 6)' : 'rgb(161 161 170)'}
                      strokeWidth={2}
                    />
                  ) : (
                    <rect
                      x={t.x}
                      y={t.y}
                      width={t.w}
                      height={t.h}
                      rx={6}
                      fill={isSel ? 'rgb(254 243 199)' : 'rgb(255 255 255)'}
                      stroke={isSel ? 'rgb(217 119 6)' : 'rgb(161 161 170)'}
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={t.x + t.w / 2}
                    y={t.y + t.h / 2 - 4}
                    textAnchor="middle"
                    className="pointer-events-none fill-zinc-900 text-[13px] font-semibold"
                  >
                    {t.label}
                  </text>
                  <text
                    x={t.x + t.w / 2}
                    y={t.y + t.h / 2 + 12}
                    textAnchor="middle"
                    className="pointer-events-none fill-zinc-500 text-[11px]"
                  >
                    {t.seats} loc.
                  </text>
                  {isSel && (
                    <rect
                      x={t.x + t.w - 8}
                      y={t.y + t.h - 8}
                      width={14}
                      height={14}
                      fill="rgb(217 119 6)"
                      stroke="white"
                      strokeWidth={2}
                      rx={2}
                      className="cursor-se-resize"
                      onPointerDown={(e) => onPointerDown(e, t.id, 'resize')}
                    />
                  )}
                </g>
              );
            })}

            {tables.length === 0 && (
              <text
                x={CANVAS_W / 2}
                y={CANVAS_H / 2}
                textAnchor="middle"
                className="fill-zinc-400 text-sm"
              >
                Apăsați &ldquo;+ Adaugă masă&rdquo; pentru a începe
              </text>
            )}
          </svg>
        </div>

        {/* Sidebar — selected table editor */}
        <aside className="rounded-md border border-zinc-200 bg-white p-4">
          {selected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">
                  Detalii masă
                </h3>
                <button
                  type="button"
                  className="text-xs text-rose-700 hover:underline"
                  onClick={() => removeTable(selected.id)}
                >
                  Șterge
                </button>
              </div>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-700">Etichetă</span>
                <input
                  type="text"
                  maxLength={40}
                  value={selected.label}
                  onChange={(e) =>
                    updateTable(selected.id, { label: e.target.value })
                  }
                  className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-700">Locuri</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={selected.seats}
                  onChange={(e) =>
                    updateTable(selected.id, {
                      seats: Math.max(
                        1,
                        Math.min(20, Number(e.target.value) || 1),
                      ),
                    })
                  }
                  className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-700">Formă</span>
                <select
                  value={selected.shape}
                  onChange={(e) =>
                    updateTable(selected.id, {
                      shape: e.target.value as TableShape,
                    })
                  }
                  className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                >
                  <option value="rect">Dreptunghi</option>
                  <option value="round">Rotundă</option>
                </select>
              </label>

              <p className="text-[11px] text-zinc-500">
                Trageți masa pentru a o muta. Trageți de pătrățelul portocaliu
                pentru redimensionare.
              </p>
            </div>
          ) : (
            <div className="text-center text-xs text-zinc-500">
              Selectați o masă pentru editare, sau apăsați &ldquo;+ Adaugă
              masă&rdquo;.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
