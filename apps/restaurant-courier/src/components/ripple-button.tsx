'use client';

import { forwardRef, useRef, type ButtonHTMLAttributes } from 'react';
import { useRipple, RippleLayer } from './touch-ripple';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  rippleColor?: string;
};

// Drop-in `<button>` replacement with a Material-style ripple. The
// caller controls the visual via className; this component only adds
// the ripple layer (positioned absolute inside, hence the host always
// gets `relative overflow-hidden`).
//
// Use sparingly — wrapping every tap-target adds DOM nodes. Reserve for
// surfaces where the rider needs tactile confirmation (Refresh, retry,
// modal CTAs) and let small chips/toggles stay plain.
export const RippleButton = forwardRef<HTMLButtonElement, Props>(function RippleButton(
  { children, className = '', rippleColor = 'bg-white/25', onPointerDown, ...rest },
  fwdRef,
) {
  const innerRef = useRef<HTMLButtonElement | null>(null);
  const ref = (fwdRef as React.MutableRefObject<HTMLButtonElement | null>) ?? innerRef;
  const { ripples, onPointerDown: rippleDown } = useRipple(ref);

  return (
    <button
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      onPointerDown={(e) => {
        rippleDown(e);
        onPointerDown?.(e);
      }}
      {...rest}
    >
      {children}
      <RippleLayer ripples={ripples} colorClass={rippleColor} />
    </button>
  );
});
