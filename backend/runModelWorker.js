// backend/runModelWorker.js
import { parentPort, workerData } from "worker_threads";

const { model, messages, ollamaUrl = "http://localhost:11434/api/chat" } = workerData;

async function run() {
  try {
    const payload = { model, messages, stream: true };
    const res = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      parentPort.postMessage({ type: "error", error: `Ollama error ${res.status}: ${text}` });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const content = parsed?.message?.content || "";

          if (parsed?.done) {
            // notify final done (done signal)
            parentPort.postMessage({ type: "done", content: fullResponse });
            return;
          }

          fullResponse += content;
          // send chunk (cumulative content)
          parentPort.postMessage({ type: "data", content: fullResponse });
        } catch (err) {
          // ignore partial JSON parse
        }
      }
    }

    // if stream ended without explicit done
    parentPort.postMessage({ type: "done", content: fullResponse });
  } catch (err) {
    parentPort.postMessage({ type: "error", error: err?.message || String(err) });
  }
}

run();
