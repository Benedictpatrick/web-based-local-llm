// The Airgap mark: a broken ring, evoking an air-gapped (physically
// isolated / offline) system rather than a closed, connected loop.
export default function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle
        cx="12"
        cy="12"
        r="7.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="36.5 10.6"
        transform="rotate(-50 12 12)"
      />
    </svg>
  );
}
