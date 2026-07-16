import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
