// Presentation frame for a product screenshot. Two variants:
//   `app`   — soft window card, for the desktop dashboard captures
//   `phone` — device bezel, for the storefront / courier PWA captures
//
// Plain <img> rather than next/image: these are already sized and compressed
// to their display width, next.config.mjs configures no image loader, and the
// rest of the marketing site uses the same pattern.

export function GuideShot({
  src,
  alt,
  width,
  height,
  frame,
  priority = false,
  compact = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  frame: 'app' | 'phone';
  priority?: boolean;
  /** Narrower phone bezel, for the four-up homepage teaser. */
  compact?: boolean;
}) {
  /* eslint-disable @next/next/no-img-element */
  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className="block h-auto w-full"
    />
  );

  if (frame === 'phone') {
    return (
      <div className="flex justify-center">
        <div
          className={`rounded-[1.6rem] bg-[#0F172A] p-1.5 shadow-xl shadow-slate-900/20 ${
            compact ? 'w-[132px]' : 'w-[240px] rounded-[2rem] p-2 sm:w-[260px]'
          }`}
        >
          <div
            className={`overflow-hidden bg-white ${compact ? 'rounded-[1.2rem]' : 'rounded-[1.55rem]'}`}
          >
            {img}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg shadow-slate-900/5">
      {img}
    </div>
  );
}
