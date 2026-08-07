import { pipeline } from "@xenova/transformers";
import { jsonrepair } from "jsonrepair";

// ---------- Vector Embedding Setup ----------
let extractor = null;
let extractorPromise = null;

export async function getExtractor() {
  if (extractor) return extractor;
  if (!extractorPromise) {
    extractorPromise = (async () => {
      console.log("🚀 Initializing local embedding model (Xenova/all-MiniLM-L6-v2)...");
      const ext = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      extractor = ext;
      console.log("✅ Embedding model ready.");
      return ext;
    })();
  }
  return extractorPromise;
}

// Generate embedding for a single string
export async function embedText(text) {
  const extract = await getExtractor();
  const output = await extract(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  if (mA === 0 || mB === 0) return 0;
  return dotProduct / (mA * mB);
}

// Helper: Chunk text into smaller pieces
export function chunkText(text, size = 1000, overlap = 200) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
    if (i + overlap >= text.length) break;
  }
  return chunks;
}

// Safety: Helper to strip Data URL prefixes for Ollama
export const cleanImages = (imgs) => {
  if (!Array.isArray(imgs)) return [];
  return imgs.map(img => (typeof img === "string" && img.includes("base64,")) ? img.split("base64,")[1] : img);
};

// Helper for extracting clean answers when JSON options are forced
export function parseCleanAnswer(rawOutput) {
  if (!rawOutput) return "";
  
  // Phase 5.4: Structured Output Parsing (try JSON first)
  try {
    let jsonStr = rawOutput
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
      
    // Attempt to repair and parse
    const repaired = jsonrepair(jsonStr);
    const parsed = JSON.parse(repaired);
    
    // If it parsed into an object, extract a text field if common, or return the stringified JSON
    if (parsed && typeof parsed === "object") {
      if (parsed.response) return String(parsed.response);
      if (parsed.content) return String(parsed.content);
      if (parsed.answer) return String(parsed.answer);
      return JSON.stringify(parsed, null, 2);
    }
  } catch (e) {
    // Not valid JSON, proceed to standard tag stripping
  }

  // 1. Initial cleanup: Remove standard wrappers and markdown blocks
  let cleaned = rawOutput
    .replace(/^Response:\s*/i, '')
    .replace(/^JSON_SCHEMA\s*/i, '')
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // 2. High-Fidelity Tag Extraction: Support [FINAL ANSWER] and [FINAL_ANSWER]
  const finalAnswerMarkers = ["[FINAL ANSWER]", "[FINAL_ANSWER]", "FINAL ANSWER:", "FINAL_ANSWER:"];
  for (const marker of finalAnswerMarkers) {
    if (cleaned.includes(marker)) {
      const parts = cleaned.split(marker);
      let candidate = parts[parts.length - 1].trim();
      if (!candidate && parts.length > 1) {
        candidate = parts[parts.length - 2].trim();
      }
      cleaned = candidate;
      break; 
    }
  }

  // 3. Command Blackhole Filter: Strip raw tool calls
  const toolCallRegex = /['"]?[\w_]+['"]?\s*\{[\s\S]*?\}\s*/g;
  const funcCallRegex = /[\w_]+\s*\([\s\S]*?\)\s*/g;
  cleaned = cleaned.replace(toolCallRegex, "").replace(funcCallRegex, "").trim();

  // 4. Brute-Force Tag Strip: Fuzzy matching
  const agenticTags = /\[(?:THOUGHT|ACTION|TOOL[\s_]INPUT|RESULT|RESPONSE|INTERIM[\s_]MESSAGE|SYNTHESIZING|FINAL[\s_]ANSWER|REASONING|PLAN|THOUGHT[\s_]PROCESS)\]/gi;
  cleaned = cleaned.replace(agenticTags, "").trim();

  return cleaned
    .replace(/^(Thought|Action|Tool[\s_]Input):\s*/gim, "")
    .replace(/\[|\]/g, "") 
    .trim();
}
