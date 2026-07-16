# Airgap

A private AI assistant and journal that runs entirely on-device, in the browser — no server, no API calls, works offline after the first load.

- **Chat** — powered by Qwen2.5 (0.5B / 1.5B / 3B), running fully client-side. Uses WebGPU ([web-llm](https://github.com/mlc-ai/web-llm)) when the device has a real GPU adapter, falling back automatically to CPU/WebAssembly ([wllama](https://github.com/ngxson/wllama)) otherwise.
- **Journal** — entries are stored locally (IndexedDB) and never leave the device. Chat retrieves relevant entries to personalize answers.
- **Installable PWA** — add to home screen on desktop or mobile; the model is cached in the browser after first download, so it keeps working offline. Downloaded models can be deleted from the model picker to free up space.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js (App Router) · TypeScript · Tailwind · Dexie (IndexedDB) · wllama · web-llm

## Deployment

Connected to Vercel — pushes to `main` deploy automatically.
