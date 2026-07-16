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
        <span
          style={{
            color: "#ffffff",
            fontSize: 13,
            fontWeight: "bold",
            letterSpacing: "-0.03em",
          }}
        >
          Navo
        </span>
      </div>
    ),
    size
  );
}
