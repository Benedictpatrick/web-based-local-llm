import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#10a37f",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="7.5"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="36.5 10.6"
            transform="rotate(-50 12 12)"
          />
        </svg>
      </div>
    ),
    size
  );
}
