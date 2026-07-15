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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#ffffff",
            marginBottom: 3,
          }}
        />
        <div
          style={{
            width: 18,
            height: 6,
            borderRadius: 3,
            background: "#ffffff",
          }}
        />
      </div>
    ),
    size
  );
}
