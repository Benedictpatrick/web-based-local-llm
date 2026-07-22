"use client";

// A comet-trail of dots flowing along a figure-8 path: they cross in the middle
// and spread onto the loops, so the shape reads as an X, then an oval, and back.
const ORBIT_DOTS = 12;
const ORBIT_DURATION = 2.6;

export default function OrbitLoader({ className }: { className?: string }) {
  return (
    <div className={`orbit-loader ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: ORBIT_DOTS }).map((_, i) => {
        const t = i / (ORBIT_DOTS - 1);
        const size = 14 - t * 8; // head 14px tapering to 6px at the tail
        return (
          <span
            key={i}
            className="orbit-dot"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              marginLeft: `${-size / 2}px`,
              marginTop: `${-size / 2}px`,
              opacity: 1 - t * 0.5,
              animationDelay: `${-(i * ORBIT_DURATION) / ORBIT_DOTS}s`,
            }}
          />
        );
      })}
    </div>
  );
}
