require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 5173;
const API_KEY = process.env.FISH_AUDIO_API_KEY;
const FISH_BASE = "https://api.fish.audio";

app.use(express.static("public"));
app.use(express.json({ limit: "4mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: !!API_KEY });
});

// Proxy TTS to Fish Audio so the API key never reaches the browser
app.post("/api/tts", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "Server not configured: FISH_AUDIO_API_KEY is missing." });
  }

  const { text, reference_id, emotion, format = "mp3", latency = "normal", sample_rate = 44100, bit_rate = 128, normalize = true } = req.body || {};

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required." });
  }

  // Use the free TTS model by default so it works without paid API credit.
  const modelHeader = req.headers["model"] || "s2.1-pro-free";

  try {
    const response = await fetch(`${FISH_BASE}/v1/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg, audio/*",
        model: modelHeader,
      },
      body: JSON.stringify({
        text,
        ...(reference_id ? { reference_id } : {}),
        ...(emotion ? { emotion } : {}),
        format,
        latency,
        sample_rate,
        bit_rate,
        normalize,
        stream: false,
      }),
    });

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const buffer = await response.buffer();

    if (!response.ok) {
      let detail;
      try { detail = JSON.parse(buffer.toString("utf-8")); } catch (_) { detail = buffer.toString("utf-8"); }
      return res.status(response.status).json({ error: detail || `Fish Audio error (${response.status})` });
    }

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, no-store");
    res.send(buffer);
  } catch (err) {
    console.error("TTS proxy error:", err);
    res.status(502).json({ error: "Failed to reach Fish Audio TTS service." });
  }
});

app.listen(PORT, () => {
  console.log(`Fish Audio Voice server running on http://localhost:${PORT}`);
});
