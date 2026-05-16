/**
 * llm.worker.js
 * ==============
 * Runs the LLM entirely inside a Web Worker so the UI never freezes.
 * Uses Transformers.js — real neural network weights, no API, no payment.
 *
 * Models (selectable):
 *   smol-135m  → HuggingFaceTB/SmolLM2-135M-Instruct  ~90MB  (ESP32-class browser)
 *   smol-360m  → HuggingFaceTB/SmolLM2-360M-Instruct  ~220MB (mobile)
 *   tinyllama  → Xenova/TinyLlama-1.1B-Chat-v1.0       ~600MB (Render free / desktop)
 *   phi3-mini  → Xenova/Phi-3-mini-4k-instruct-onnx    ~2.3GB (full hosting)
 */

import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStopCriteria,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0";

const MODELS = {
  "smol-135m": {
    id: "HuggingFaceTB/SmolLM2-135M-Instruct",
    dtype: "q4f16",
    label: "SmolLM2 135M ⚡ (~90MB)",
    device: "wasm",
  },
  "smol-360m": {
    id: "HuggingFaceTB/SmolLM2-360M-Instruct",
    dtype: "q4f16",
    label: "SmolLM2 360M 🚀 (~220MB)",
    device: "wasm",
  },
  "tinyllama": {
    id: "Xenova/TinyLlama-1.1B-Chat-v1.0",
    dtype: "q4",
    label: "TinyLlama 1.1B 🧠 (~600MB)",
    device: "wasm",
  },
  "phi3-mini": {
    id: "microsoft/Phi-3-mini-4k-instruct-onnx-web",
    dtype: "q4",
    label: "Phi-3 Mini 🌟 (~2.3GB)",
    device: "webgpu",
  },
};

let tokenizer = null;
let model = null;
let stopCriteria = null;
let currentModelKey = null;

// ── Load model ────────────────────────────────────────────────────────────────
async function loadModel(modelKey) {
  if (currentModelKey === modelKey && model) {
    self.postMessage({ type: "ready", modelKey });
    return;
  }

  // Unload previous model
  model = null;
  tokenizer = null;
  currentModelKey = null;

  const cfg = MODELS[modelKey];
  if (!cfg) {
    self.postMessage({ type: "error", message: `Unknown model: ${modelKey}` });
    return;
  }

  self.postMessage({ type: "loading", label: cfg.label });

  try {
    tokenizer = await AutoTokenizer.from_pretrained(cfg.id, {
      progress_callback: (p) => self.postMessage({ type: "progress", data: p }),
    });

    model = await AutoModelForCausalLM.from_pretrained(cfg.id, {
      dtype: cfg.dtype,
      device: cfg.device,
      progress_callback: (p) => self.postMessage({ type: "progress", data: p }),
    });

    currentModelKey = modelKey;
    self.postMessage({ type: "ready", modelKey, label: cfg.label });
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
}

// ── Generate ──────────────────────────────────────────────────────────────────
async function generate(messages, maxNewTokens = 512) {
  if (!model || !tokenizer) {
    self.postMessage({ type: "error", message: "Model not loaded" });
    return;
  }

  stopCriteria = new InterruptableStopCriteria();

  try {
    // Apply chat template
    const inputs = tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
      tokenize: true,
      return_tensors: "pt",
    });

    let outputText = "";

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (token) => {
        outputText += token;
        self.postMessage({ type: "token", token, full: outputText });
      },
    });

    await model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.9,
      repetition_penalty: 1.1,
      streamer,
      stopping_criteria: stopCriteria,
    });

    self.postMessage({ type: "done", text: outputText });
  } catch (e) {
    if (e.message?.includes("Aborted")) {
      self.postMessage({ type: "aborted" });
    } else {
      self.postMessage({ type: "error", message: e.message });
    }
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener("message", async (e) => {
  const { type } = e.data;
  if (type === "load")     await loadModel(e.data.modelKey);
  if (type === "generate") await generate(e.data.messages, e.data.maxNewTokens);
  if (type === "stop")     stopCriteria?.interrupt();
  if (type === "models")   self.postMessage({ type: "models", models: MODELS });
});
