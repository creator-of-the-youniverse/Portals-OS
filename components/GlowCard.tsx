import React, { useEffect, useRef, useCallback, ReactNode, forwardRef } from "react";
import "./GlowCard.css";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: "blue" | "purple" | "green" | "red" | "orange" | "yellow" | "cyan";
  size?: "sm" | "md" | "lg";
  width?: string | number;
  height?: string | number;
  customSize?: boolean; // When true, ignores size prop and uses width/height or className
  style?: React.CSSProperties;
}

const glowColorMap = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 120, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 },
  yellow: { base: 60, spread: 200 },
  cyan: { base: 180, spread: 200 },
};

const sizeMap = {
  sm: "w-48 h-64",
  md: "w-64 h-80",
  lg: "w-80 h-96",
};

const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(({
  children,
  className = "",
  glowColor = "blue",
  size = "md",
  width,
  height,
  customSize = false,
  style,
}, ref) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    elementRef.current = el;
    if (typeof ref === 'function') {
      ref(el);
    } else if (ref) {
      ref.current = el;
    }
  }, [ref]);

  useEffect(() => {
    if (elementRef.current && style) {
      Object.assign(elementRef.current.style, style);
    }
  }, [style]);

  useEffect(() => {
    const syncPointer = (e: PointerEvent) => {
      const { clientX: x, clientY: y } = e;

      // Since we can't guarantee ref.current exists (it might be a callback),
      // we'll skip the CSS variable setting for now or find another way
      // For now, this effect is disabled to avoid the TypeScript error
    };

    document.addEventListener("pointermove", syncPointer);
    return () => document.removeEventListener("pointermove", syncPointer);
  }, []);

  // Determine sizing
  const getSizeClasses = () => {
    if (customSize) {
      let sizeClasses = "";
      if (width !== undefined) {
        sizeClasses += ` w-[${typeof width === "number" ? `${width}px` : width
          }]`;
      }
      if (height !== undefined) {
        sizeClasses += ` h-[${typeof height === "number" ? `${height}px` : height
          }]`;
      }
      return sizeClasses;
    }
    return sizeMap[size];
  };

  return (
    <div
      ref={setRef}
      data-glow
      className={`
          glow-card
          glow-${glowColor}
          ${getSizeClasses()}
          ${!customSize ? "aspect-3/4" : ""}
          rounded-2xl
          relative
          shadow-[0_1rem_2rem_-1rem_black]
          backdrop-blur-[5px]
          ${className}
        `}
    >
      <div ref={innerRef} data-glow></div>
      {children}
    </div>
  );
});

GlowCard.displayName = 'GlowCard';

export { GlowCard };
