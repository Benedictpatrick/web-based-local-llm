"use client";

/**
 * The 5-second branded entrance shown only when switching INTO Navo Research
 * (never on the way back to plain Navo, which keeps its quick ~550ms beat).
 * Choreography lives in globals.css (research-splash-* keyframes): the
 * wordmark scales/fades in first, then the RESEARCH label and underline fade
 * up beneath it, everything holds, then the whole overlay fades out right as
 * this component unmounts.
 */
export default function ResearchSplash() {
  return (
    <div className="research-splash fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4">
      <img
        src="/navo-wordmark.png"
        alt="Navo"
        className="research-splash__wordmark h-14 w-auto sm:h-20"
      />
      <div className="flex flex-col items-center gap-2">
        <p className="research-splash__label text-sm font-semibold tracking-[0.5em] text-white">
          RESEARCH
        </p>
        <span className="research-splash__underline inline-block h-[2px] rounded-full bg-accent" />
      </div>
    </div>
  );
}
