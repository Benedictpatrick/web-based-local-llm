# web-based-local-llm

A private AI assistant and journal that runs entirely on-device, in the browser — no server, no API calls, works offline after the first load.

- **Chat** — powered by Qwen2.5 (0.5B / 1.5B / 3B), running fully client-side via [wllama](https://github.com/ngxson/wllama) (llama.cpp compiled to WebAssembly). CPU-only, no GPU required.
- **Journal** — entries are stored locally (IndexedDB) and never leave the device. Chat retrieves relevant entries to personalize answers.
- **Installable PWA** — add to home screen on desktop or mobile; the model is cached in the browser after first download, so it keeps working offline.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

Next.js (App Router) · TypeScript · Tailwind · Dexie (IndexedDB) · wllama
