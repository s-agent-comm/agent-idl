const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");
const enableBtn = document.getElementById("enable");

let summarizer = null;
const translators = new Map();
let ws;

function log(line) {
  logEl.textContent += `${line}\n`;
}

async function initAi() {
  if (!("Summarizer" in self) && !("Translator" in self)) {
    statusEl.textContent = "Built-in AI not available";
    return;
  }

  if ("Summarizer" in self) {
    const availability = await Summarizer.availability();
    if (availability !== "unavailable") {
      if (!navigator.userActivation?.isActive) {
        log("Summarizer requires user activation. Click Enable AI again if needed.");
      }
      summarizer = await Summarizer.create({
        type: "key-points",
        monitor(m) {
          m.addEventListener("downloadprogress", e => {
            log(`Summarizer download: ${Math.round(e.loaded * 100)}%`);
          });
        },
      });
      log("Summarizer ready");
    } else {
      log("Summarizer not available");
    }
  }

  if ("Translator" in self) {
    const availability = await Translator.availability({ sourceLanguage: "en", targetLanguage: "zh" });
    if (availability !== "unavailable") {
      log("Translator available");
    } else {
      log("Translator not available");
    }
  }

  statusEl.textContent = summarizer || translators.size > 0 ? "Ready" : "No AI available";
}

enableBtn.addEventListener("click", async () => {
  statusEl.textContent = "Initializing...";
  await initAi();
});

function ensureSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  ws = new WebSocket("ws://localhost:8790");

  ws.addEventListener("open", () => {
    log("WS connected");
  });

  ws.addEventListener("message", async event => {
    const msg = JSON.parse(event.data);
    if (!msg || !msg.id) return;

    if (msg.intent === "agent:SummarizeText") {
      if (!summarizer) {
        ws.send(JSON.stringify({ id: msg.id, error: "Summarizer not available" }));
        return;
      }
      try {
        const input = msg.payload?.request?.text || "";
        const summary = await summarizer.summarize(input);
        ws.send(JSON.stringify({ id: msg.id, result: { summary } }));
      } catch (err) {
        ws.send(JSON.stringify({ id: msg.id, error: err.message || String(err) }));
      }
      return;
    }

    if (msg.intent === "agent:TranslateText") {
      if (!("Translator" in self)) {
        ws.send(JSON.stringify({ id: msg.id, error: "Translator not available" }));
        return;
      }
      try {
        const input = msg.payload?.request?.text || "";
        const sourceLanguage = msg.payload?.request?.sourceLanguage || "en";
        const targetLanguage = msg.payload?.request?.targetLanguage || "zh";
        const key = `${sourceLanguage}:${targetLanguage}`;
        if (!translators.has(key)) {
          const translator = await Translator.create({ sourceLanguage, targetLanguage });
          translators.set(key, translator);
          log(`Translator ready: ${key}`);
        }
        const translator = translators.get(key);
        const translated = await translator.translate(input);
        ws.send(JSON.stringify({ id: msg.id, result: { translated } }));
      } catch (err) {
        ws.send(JSON.stringify({ id: msg.id, error: err.message || String(err) }));
      }
      return;
    }

    ws.send(JSON.stringify({ id: msg.id, error: "Unknown intent" }));
  });

  ws.addEventListener("close", () => log("WS closed"));
}

ensureSocket();
