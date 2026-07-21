import { BRAND_ICONS, MULTI_COLOR_ICONS, type Provider } from "@/lib/brandIcons";

/** Renders a model's maker logo (Meta, Google, Qwen, etc.) at a given pixel
 *  size. Returns null for providers with no safe icon (see brandIcons.ts). */
export default function BrandMark({ provider, size = 12 }: { provider: Provider; size?: number }) {
  const multi = MULTI_COLOR_ICONS[provider];
  if (multi) {
    return (
      <svg width={size} height={size} viewBox={multi.viewBox} className="shrink-0" aria-hidden="true">
        {multi.paths.map((p, i) => (
          <path key={i} fill={p.fill} d={p.d} />
        ))}
      </svg>
    );
  }
  const icon = BRAND_ICONS[provider];
  if (!icon) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={icon.hex} className="shrink-0" aria-hidden="true">
      <path d={icon.path} />
    </svg>
  );
}
