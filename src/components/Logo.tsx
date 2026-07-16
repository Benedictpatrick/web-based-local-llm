// Navo has no separate icon mark — the wordmark is the logo. This is only
// used where a small glyph is structurally required (chat avatar), styled
// as a plain letterform rather than an unrelated abstract shape.
export default function LogoMark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center font-semibold ${className ?? ""}`}>
      N
    </span>
  );
}
