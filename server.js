/**
 * NANO CLAUDE v2 — Local LLM Edition
 * ====================================
 * ✅ ZERO API keys  ✅ ZERO payment  ✅ Real neural network
 *
 * The LLM runs ENTIRELY in the user's browser via Transformers.js.
 * This server only handles:
 *   - Serving the frontend
 *   - Saving/loading chat history to Neon PostgreSQL
 *
 * Env vars:
 *   DATABASE_URL  — Neon PostgreSQL (optional, falls back to memory)
 *   PORT          — default 3000
 */

require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

// ── Neon DB ───────────────────────────────────────────────────────────────────
let sql = null;
if (process.env.DATABASE_URL) {
  try {
    const { neon } = require("@neondatabase/serverless");
    sql = neon(process.env.DATABASE_URL);
    console.log("✅ Neon database connected");
  } catch (e) {
    console.warn("⚠️  Neon DB load failed:", e.message);
  }
} else {
  console.warn("⚠️  No DATABASE_URL — running memory mode");
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const mem = new Map(); // userId → { name, conversations: Map }

async function dbQuery(q, ...p) {
  if (!sql) return null;
  try { return await sql(q, ...p); } catch (e) { console.error("DB:", e.message); return null; }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// ── GET /api/status ───────────────────────────────────────────────────────────
app.get("/api/status", (_, res) => res.json({
  db: !!sql,
  version: "2.0.0",
  mode: "local-llm"
}));

// ── POST /api/users ───────────────────────────────────────────────────────────
app.post("/api/users", async (req, res) => {
  const { name = "User", userId } = req.body;
  if (userId) {
    if (sql) {
      const r = await dbQuery(`SELECT * FROM nc_users WHERE id=$1`, userId);
      if (r?.length) { await dbQuery(`UPDATE nc_users SET last_seen=NOW() WHERE id=$1`, userId); return res.json({ user: r[0] }); }
    } else if (mem.has(userId)) {
      return res.json({ user: { id: userId, name: mem.get(userId).name } });
    }
  }
  const id = uuidv4();
  if (sql) {
    const r = await dbQuery(`INSERT INTO nc_users (id,name) VALUES ($1,$2) RETURNING *`, id, name);
    return res.json({ user: r[0] });
  }
  mem.set(id, { name, conversations: new Map() });
  res.json({ user: { id, name } });
});

// ── GET /api/conversations/:userId ────────────────────────────────────────────
app.get("/api/conversations/:userId", async (req, res) => {
  const { userId } = req.params;
  if (sql) {
    const r = await dbQuery(`SELECT id,title,created_at,updated_at FROM nc_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 60`, userId);
    return res.json({ conversations: r || [] });
  }
  const store = mem.get(userId);
  if (!store) return res.json({ conversations: [] });
  const list = [...store.conversations.entries()].map(([id, c]) => ({ id, title: c.title, updated_at: c.updated_at })).reverse();
  res.json({ conversations: list });
});

// ── POST /api/conversations ───────────────────────────────────────────────────
app.post("/api/conversations", async (req, res) => {
  const { userId, title = "New Chat" } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const id = uuidv4();
  if (sql) {
    const r = await dbQuery(`INSERT INTO nc_conversations (id,user_id,title) VALUES ($1,$2,$3) RETURNING *`, id, userId, title);
    return res.json({ conversation: r[0] });
  }
  const store = mem.get(userId);
  if (!store) return res.status(404).json({ error: "user not found" });
  store.conversations.set(id, { title, messages: [], updated_at: new Date() });
  res.json({ conversation: { id, title } });
});

// ── GET /api/messages/:convId ─────────────────────────────────────────────────
app.get("/api/messages/:convId", async (req, res) => {
  const { convId } = req.params;
  if (sql) {
    const r = await dbQuery(`SELECT id,role,content,created_at FROM nc_messages WHERE conversation_id=$1 ORDER BY created_at ASC`, convId);
    return res.json({ messages: r || [] });
  }
  for (const [, store] of mem) {
    if (store.conversations.has(convId)) return res.json({ messages: store.conversations.get(convId).messages });
  }
  res.json({ messages: [] });
});

// ── POST /api/messages ────────────────────────────────────────────────────────
// Save a completed exchange (user msg + AI reply) after inference runs in browser
app.post("/api/messages", async (req, res) => {
  const { conversationId, userMessage, aiMessage, autoTitle } = req.body;
  if (!conversationId) return res.status(400).json({ error: "conversationId required" });

  if (sql) {
    await dbQuery(`INSERT INTO nc_messages (conversation_id,role,content) VALUES ($1,'user',$2)`, conversationId, userMessage);
    await dbQuery(`INSERT INTO nc_messages (conversation_id,role,content) VALUES ($1,'assistant',$2)`, conversationId, aiMessage);
    if (autoTitle) await dbQuery(`UPDATE nc_conversations SET title=$1 WHERE id=$2`, autoTitle, conversationId);
  } else {
    for (const [, store] of mem) {
      if (store.conversations.has(conversationId)) {
        const conv = store.conversations.get(conversationId);
        conv.messages.push({ role: "user", content: userMessage }, { role: "assistant", content: aiMessage });
        conv.updated_at = new Date();
        if (autoTitle) conv.title = autoTitle;
        break;
      }
    }
  }
  res.json({ saved: true });
});

// ── DELETE /api/conversations/:id ─────────────────────────────────────────────
app.delete("/api/conversations/:id", async (req, res) => {
  const { id } = req.params;
  if (sql) await dbQuery(`DELETE FROM nc_conversations WHERE id=$1`, id);
  else for (const [, s] of mem) s.conversations.delete(id);
  res.json({ deleted: true });
});

app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n⚡ Nano Claude v2 → http://localhost:${PORT}`);
  console.log(`   AI engine : Transformers.js (runs in browser)`);
  console.log(`   DB        : ${sql ? "Neon PostgreSQL ✅" : "Memory ⚡"}`);
  console.log(`   API keys  : NONE required\n`);
});
