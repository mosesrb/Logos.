import { pipeline } from "@xenova/transformers";

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
