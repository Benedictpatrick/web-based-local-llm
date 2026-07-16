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
          color: "#ffffff",
          fontSize: 100,
          fontWeight: 600,
        }}
      >
        N
      </div>
    ),
    size
  );
}
