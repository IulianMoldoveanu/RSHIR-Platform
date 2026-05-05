'use client';

export type PickerTable = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  seats: number;
  label: string;
  shape?: 'rect' | 'round';
};

const CANVAS_W = 800;
const CANVAS_H = 500;

export function TablePicker({
  tables,
  selectedId,
  unavailableIds,
  partySize,
  onSelect,
}: {
  tables: PickerTable[];
  selectedId: string | null;
  unavailableIds: Set<string>;
  partySize: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="block h-auto w-full"
        role="application"
        aria-label="Plan mese"
      >
        <defs>
          <pattern
            id="picker-grid"
            width={40}
            height={40}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
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
          fill="url(#picker-grid)"
        />

        {tables.map((t) => {
          const taken = unavailableIds.has(t.id);
          const tooSmall = partySize > 0 && t.seats > 0 && partySize > t.seats;
          const disabled = taken || tooSmall;
          const isSel = selectedId === t.id;

          let fill = 'rgb(255 255 255)';
          let stroke = 'rgb(161 161 170)';
          if (isSel) {
            fill = 'rgb(187 247 208)';
            stroke = 'rgb(22 163 74)';
          } else if (taken) {
            fill = 'rgb(254 226 226)';
            stroke = 'rgb(225 29 72)';
          } else if (tooSmall) {
            fill = 'rgb(244 244 245)';
            stroke = 'rgb(212 212 216)';
          }

          const handlePick = () => {
            if (!disabled) onSelect(t.id);
          };

          const cursorClass = disabled ? 'cursor-not-allowed' : 'cursor-pointer';
          const reasonLabel = taken
            ? 'rezervată'
            : tooSmall
              ? `${t.seats} locuri (insuficiente)`
              : `${t.seats} locuri`;

          return (
            <g
              key={t.id}
              onClick={handlePick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePick();
                }
              }}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              aria-label={`${t.label}, ${reasonLabel}`}
              aria-pressed={isSel}
              className={`${cursorClass} focus:outline-none`}
            >
              {t.shape === 'round' ? (
                <ellipse
                  cx={t.x + t.w / 2}
                  cy={t.y + t.h / 2}
                  rx={t.w / 2}
                  ry={t.h / 2}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSel ? 3 : 2}
                />
              ) : (
                <rect
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSel ? 3 : 2}
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
                {taken ? 'rezervată' : `${t.seats} loc.`}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-emerald-600 bg-emerald-100" />
          Selectată
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-zinc-400 bg-white" />
          Disponibilă
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-rose-600 bg-rose-100" />
          Rezervată
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-zinc-300 bg-zinc-100" />
          Prea mică
        </span>
      </div>
    </div>
  );
}
