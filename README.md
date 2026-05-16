# ⚡ Nano Claude v2 — Real Local LLM

**Zero API keys. Zero payment. Real neural network weights running in your browser.**

The LLM inference runs 100% client-side via [Transformers.js](https://huggingface.co/docs/transformers.js).
The server only stores chat history in Neon PostgreSQL.

---

## 🧠 How it works

```
Browser
├── llm.worker.js          ← Downloads model once, runs inference
│   └── Transformers.js    ← WebAssembly / WebGPU neural network
│       └── ONNX Runtime   ← Quantized model weights
└── index.html             ← Chat UI, streams tokens from worker

Server (Node.js / Render free)
└── server.js              ← Only saves/loads chat history
    └── Neon PostgreSQL    ← Persistent chat storage
```

---

## 📊 Model tiers

| Option | Model | Size | Device | Best for |
|--------|-------|------|--------|----------|
| ⚡ SmolLM2 135M | HuggingFaceTB/SmolLM2-135M-Instruct | ~90MB | WebAssembly | Very low-power |
| 🚀 SmolLM2 360M | HuggingFaceTB/SmolLM2-360M-Instruct | ~220MB | WebAssembly | Mobile default |
| 🧠 TinyLlama 1.1B | Xenova/TinyLlama-1.1B-Chat-v1.0 | ~600MB | WebAssembly | Render free |
| 🌟 Phi-3 Mini | microsoft/Phi-3-mini-4k-instruct | ~2.3GB | WebGPU | Full hosting |

Models download once from Hugging Face CDN, then cached in browser (IndexedDB).

---

## 🚀 Setup

```bash
git clone https://github.com/yourname/nano-claude.git
cd nano-claude
npm install
cp .env.example .env
# Optionally add DATABASE_URL from neon.tech
npm start
# → http://localhost:3000
```

Run `schema.sql` in your Neon SQL editor to create tables.

---

## 🌐 Deploy to Render

1. Push to GitHub
2. Render → New Web Service → connect repo
3. Build: `npm install` · Start: `npm start`
4. Add env var: `DATABASE_URL` (optional)
5. Deploy — no other keys needed

---

## ℹ️ Notes

- First load downloads the model (takes 10–60 seconds depending on model + connection)
- Subsequent loads are instant (browser cache)
- No data ever sent to Anthropic or any AI API
- The server has zero AI code — it's purely a DB proxy
- 
