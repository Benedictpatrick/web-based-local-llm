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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: "#ffffff",
            marginBottom: 16,
          }}
        />
        <div
          style={{
            width: 100,
            height: 32,
            borderRadius: 16,
            background: "#ffffff",
          }}
        />
      </div>
    ),
    size
  );
}
