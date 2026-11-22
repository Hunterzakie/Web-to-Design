(function () {
  const form = document.getElementById("ttsForm");
  const textInput = document.getElementById("text");
  const countEl = document.getElementById("count");
  const textError = document.getElementById("textError");
  const generateBtn = document.getElementById("generateBtn");
  const btnLabel = generateBtn.querySelector(".btn-label");
  const spinner = generateBtn.querySelector(".spinner");
  const status = document.getElementById("status");
  const output = document.getElementById("output");
  const audio = document.getElementById("audio");
  const downloadLink = document.getElementById("downloadLink");
  const audioNote = document.getElementById("audioNote");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playIcon = document.getElementById("playIcon");
  const pauseIcon = document.getElementById("pauseIcon");
  const timeDisplay = document.getElementById("timeDisplay");

  const MAX_CHARS = 2000;
  let currentObjectUrl = null;
  let selectedEmotion = "";

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = "status " + (kind || "");
    status.hidden = !message;
  }

  function revokeCurrent() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  }

  function setLoading(loading) {
    generateBtn.disabled = loading;
    btnLabel.textContent = loading ? "Generating…" : "Generate voice";
    spinner.style.display = loading ? "inline-block" : "none";
    setStatus("");
    output.hidden = true;
    revokeCurrent();
    audio.src = "";
    downloadLink.href = "";
    downloadLink.hidden = true;
    downloadLink.onclick = null;
    audioNote.hidden = true;
  }

  function insertAtCursor(textarea, text) {
    if (!text) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    const pos = start + text.length;
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---------- Emotion buttons ----------
  function setSelectedEmotion(emotion) {
    selectedEmotion = emotion;
    document.querySelectorAll(".emotion-btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.emotion === emotion);
    });
  }

  document.querySelectorAll(".emotion-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emotion = btn.dataset.emotion;
      setSelectedEmotion(emotion);
      if (emotion) {
        insertAtCursor(textInput, "[" + emotion + "] ");
      }
    });
  });

  // ---------- Play / Pause ----------
  playPauseBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch((err) => {
        console.error("Play failed:", err);
        setStatus("Browser blocked autoplay. Click Play again.", "error");
      });
    } else {
      audio.pause();
    }
  });

  // ---------- TTS ----------
  textInput.addEventListener("input", () => {
    const len = textInput.value.length;
    countEl.textContent = len + " chars";
    countEl.classList.toggle("over", len > MAX_CHARS);
    textError.textContent = "";
  });

  async function showError(message) {
    setStatus(message || "Something went wrong.", "error");
    setLoading(false);
  }

  function formatTime(seconds) {
    if (!seconds || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function updatePlayPauseUI() {
    const playing = !audio.paused;
    playIcon.style.display = playing ? "none" : "inline-block";
    pauseIcon.style.display = playing ? "inline-block" : "none";
    playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    playPauseBtn.setAttribute("title", playing ? "Pause" : "Play");
  }

  function wireDownload(blob, fileName) {
    revokeCurrent();
    currentObjectUrl = URL.createObjectURL(blob);
    audio.src = currentObjectUrl;
    audio.load();

    // Sync time display
    audio.addEventListener("loadedmetadata", () => {
      timeDisplay.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
    }, { once: true });
    audio.addEventListener("timeupdate", () => {
      timeDisplay.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
    });
    audio.addEventListener("play", updatePlayPauseUI);
    audio.addEventListener("pause", updatePlayPauseUI);
    audio.addEventListener("ended", () => {
      updatePlayPauseUI();
    });

    downloadLink.href = currentObjectUrl;
    downloadLink.download = fileName;
    downloadLink.hidden = false;
    downloadLink.onclick = (ev) => {
      const a = document.createElement("a");
      a.href = currentObjectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    audioNote.hidden = false;
    output.hidden = false;

    // Auto-play after generation
    audio.play().catch((err) => {
      // Autoplay may be blocked by the browser; show play icon so user can start manually
      console.log("Autoplay blocked or failed:", err);
      updatePlayPauseUI();
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    if (!text) {
      textError.textContent = "Please enter some text.";
      textInput.focus();
      return;
    }
    if (text.length > MAX_CHARS) {
      textError.textContent = "Please keep text under " + MAX_CHARS + " characters.";
      textInput.focus();
      return;
    }

    const voiceInput = document.getElementById("voice");
    const formatSelect = document.getElementById("format");

    const payload = {
      text,
      reference_id: voiceInput.value.trim() || undefined,
      emotion: selectedEmotion || undefined,
      format: formatSelect.value,
    };

    setLoading(true);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        let detail = "Failed to generate voice.";
        if (contentType.includes("application/json")) {
          const err = await response.json();
          detail = err.error || detail;
        } else {
          detail = await response.text();
        }
        throw new Error(detail);
      }

      if (!contentType.startsWith("audio/")) {
        throw new Error("Unexpected response from the server.");
      }

      const blob = await response.blob();
      const ext = (payload.format || "mp3").toLowerCase();
      wireDownload(blob, "voiceover." + ext);
      setStatus("Voice ready.", "success");
    } catch (err) {
      showError(err.message || "Something went wrong.");
      console.error(err);
    } finally {
      generateBtn.disabled = false;
      btnLabel.textContent = "Generate voice";
      spinner.style.display = "none";
    }
  });

  window.addEventListener("beforeunload", revokeCurrent);
})();
