import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

// ComfyUI Paths & Config
const COMFYUI_BASE = "http://127.0.0.1:8188";
export const COMFYUI_INSTALL_DIR = "E:\\MachineApps\\ComfyUI";
const COMFYUI_WORKFLOW_PATH = path.join(backendDir, "comfyui", "workflows", "workflow_api.json");
const COMFYUI_REAL_OUTPUT_DIR = "E:\\MachineApps\\ComfyUI\\ComfyUI\\output";

const LOW_VRAM_MODE = true; 
const COMFYUI_OPTIMIZED_WORKFLOW_PATH = path.join(backendDir, "comfyui", "workflows", "sdxl_optimized_workflow.json");
const COMFYUI_LIGHTNING_WORKFLOW_PATH = path.join(backendDir, "comfyui", "workflows", "lightning_uncensored.json");

/** Graceful fallback — creates a blank placeholder and returns a mock path */
export function _comfyFallback(filename) {
  const fallbackFilename = `fallback_${filename}_${Date.now()}.png`;
  const destDir = path.join(backendDir, "output");
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const fallbackPath = path.join(destDir, fallbackFilename);
  try { 
    fs.writeFileSync(fallbackPath, ""); 
  } catch(e) {}
  console.warn(`   ↳ Fallback placeholder written: ${fallbackFilename}`);
  return `/output/${fallbackFilename}`;
}

/**
 * Loads workflow_api.json, injects real prompt + reference paths,
 * posts to ComfyUI, polls /history until done, returns /output/{filename}.
 * Falls back gracefully if ComfyUI is offline.
 */
export async function generateViaComfyUI(payload) {
  const { 
    prompt, 
    references = [], 
    seed, 
    filename: requestedFilename,
    mode = "fast", 
    lora_strength = 0.7,
    ipadapter_weight = 0.7,
    batch_size = 1
  } = payload.data || payload;

  const filename = requestedFilename || `gen_${Date.now()}`;
  console.log(`🚀 COMFYUI: Preparing workflow for prompt: "${(prompt || "").slice(0, 60)}..."`);

  let workflow;
  const workflowPath = fs.existsSync(COMFYUI_LIGHTNING_WORKFLOW_PATH) 
    ? COMFYUI_LIGHTNING_WORKFLOW_PATH 
    : (LOW_VRAM_MODE ? COMFYUI_OPTIMIZED_WORKFLOW_PATH : COMFYUI_WORKFLOW_PATH);

  try {
    const raw = fs.readFileSync(workflowPath, "utf8");
    workflow = JSON.parse(raw);
    console.log(`👤 COMFYUI: Using ${path.basename(workflowPath)} template [Mode: ${mode.toUpperCase()}].`);
  } catch (e) {
    console.warn(`⚠️ COMFYUI: Could not load workflow ${workflowPath}:`, e.message);
    return _comfyFallback(filename);
  }

  let hasInjectedPrompt = false;
  
  const findNodesByType = (type) => Object.entries(workflow).filter(([k, n]) => n.class_type === type);

  findNodesByType("SaveImage").forEach(([k, n]) => {
    n.inputs.filename_prefix = filename;
  });
  findNodesByType("EmptyLatentImage").forEach(([k, n]) => {
    n.inputs.batch_size = Math.min(Math.max(batch_size, 1), 4);
  });

  const samplerTypes = ["KSampler", "SamplerCustom", "KSamplerAdvanced"];
  samplerTypes.forEach(type => {
    findNodesByType(type).forEach(([k, n]) => {
      if (seed !== undefined) n.inputs.seed = seed;
      else n.inputs.seed = Math.floor(Math.random() * 1000000);
      
      if (mode === "quality") {
        n.inputs.steps = 20; 
        n.inputs.cfg = 6.0; 
        console.log(`🎨 COMFYUI: Quality Mode engaged (20 steps).`);
      } else {
        n.inputs.steps = 4;
        n.inputs.cfg = 1.7; 
      }
    });
  });

  const loraNodes = findNodesByType("LoraLoader");
  loraNodes.forEach(([k, n]) => {
    const loraName = n.inputs.lora_name;
    const loraLocalPath = path.join(COMFYUI_INSTALL_DIR, "ComfyUI", "models", "loras", loraName);
    
    let exists = fs.existsSync(loraLocalPath);
    if (exists) {
      const stats = fs.statSync(loraLocalPath);
      if (stats.size < 1024 * 1024) { 
        console.warn(`⚠️ COMFYUI: LoRA [${loraName}] is too small (${stats.size} bytes). Treating as missing.`);
        exists = false;
      }
    }
    
    if (!exists) {
      console.warn(`⚠️ COMFYUI: LoRA [${loraName}] not found. Bypassing node ${k}...`);
      
      const baseModelSource = n.inputs.model;
      const baseClipSource = n.inputs.clip;

      Object.values(workflow).forEach(node => {
        if (node.inputs) {
          Object.keys(node.inputs).forEach(inputKey => {
            const link = node.inputs[inputKey];
            if (Array.isArray(link) && link[0] === k) {
               if (link[1] === 0) node.inputs[inputKey] = baseModelSource;
               if (link[1] === 1) node.inputs[inputKey] = baseClipSource;
            }
          });
        }
      });
      delete workflow[k]; 
    } else {
      n.inputs.strength_model = parseFloat(lora_strength);
      n.inputs.strength_clip = parseFloat(lora_strength);
    }
  });

  findNodesByType("IPAdapter").forEach(([k, n]) => {
    n.inputs.weight = parseFloat(ipadapter_weight);
  });

  findNodesByType("CLIPTextEncode").forEach(([k, n]) => {
    if (!hasInjectedPrompt) {
      n.inputs.text = prompt || "a beautiful image";
      hasInjectedPrompt = true;
    }
  });

  const loadNodes = findNodesByType("LoadImage");
  if (references.length > 0) {
    for (const refPath of references) {
      const freeNode = loadNodes.find(([k, n]) => !n._has_injected_ref);
      if (freeNode) {
        const [key, node] = freeNode;
        if (fs.existsSync(refPath)) {
          const inputDir = path.join(COMFYUI_INSTALL_DIR, "ComfyUI", "input");
          if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
          const refFilename = `persona_ref_${Date.now()}_${Math.floor(Math.random()*1000)}${path.extname(refPath)}`;
          const destPath = path.join(inputDir, refFilename);
          try {
            fs.copyFileSync(refPath, destPath);
            node.inputs.image = refFilename;
            node._has_injected_ref = true;
            console.log(`👤 COMFYUI: Copied and Injected reference -> Node ${key}: ${refFilename}`);
          } catch (e) {
            console.error(`❌ COMFYUI: Reference failure:`, e.message);
          }
        }
      }
    }
  }

  let usedRef = false;
  Object.values(workflow).forEach(n => { if (n._has_injected_ref) usedRef = true; });

  if (!usedRef) {
     const adapters = findNodesByType("IPAdapterApply") || findNodesByType("IPAdapter");
     if (adapters.length > 0) {
        console.log("👤 COMFYUI: No references. Rewiring workflow to bypass IPAdapters...");
        adapters.forEach(([id, node]) => {
           const sourceModel = node.inputs.model;
           
           Object.entries(workflow).forEach(([sk, sn]) => {
              if (sn.inputs && sn.inputs.model && sn.inputs.model[0] === id) {
                 sn.inputs.model = sourceModel;
                 console.log(`👤 COMFYUI: Rewired Sampler ${sk} to use Model ${sourceModel[0]} (Bypassed Adapter ${id})`);
              }
           });
           
           delete workflow[id];
        });
     } else {
        const samplerId = LOW_VRAM_MODE ? "5" : "3";
        const loaderId = LOW_VRAM_MODE ? "1" : "28";
        const adapterId = "10";
        if (workflow[adapterId] && workflow[samplerId]) {
           workflow[samplerId].inputs.model = [ loaderId, 0 ];
           delete workflow[adapterId];
        }
     }
  }

  let promptId;
  try {
    const postRes = await fetch(`${COMFYUI_BASE}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    });
    if (!postRes.ok) throw new Error(`ComfyUI POST failed: ${postRes.status}`);
    const postData = await postRes.json();
    promptId = postData.prompt_id;
    console.log(`⏱️ COMFYUI: Queued! prompt_id = ${promptId}`);
  } catch (e) {
    console.warn("⚠️ COMFYUI: POST failed (is ComfyUI running?):", e.message);
    return _comfyFallback(filename);
  }

  const MAX_WAIT_MS = 300 * 1000; 
  const POLL_INTERVAL_MS = 2000;
  const startTime = Date.now();
  const outputFilenames = [];

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const histRes = await fetch(`${COMFYUI_BASE}/history/${promptId}`);
      if (!histRes.ok) continue;
      const hist = await histRes.json();
      const entry = hist[promptId];
      if (!entry) continue;

      if (entry.status && entry.status.completed) {
        if (entry.outputs) {
          const outputs = Object.values(entry.outputs);
          for (const out of outputs) {
            if (out.images && out.images.length > 0) {
              out.images.forEach(img => outputFilenames.push(img.filename));
            }
          }
        }
        break; 
      }
      console.log(`   ...polling ComfyUI (${Math.round((Date.now()-startTime)/1000)}s elapsed)`);
    } catch (e) { }
  }

  if (outputFilenames.length === 0) {
    console.warn("⚠️ COMFYUI: Timed out waiting for output. Using fallback.");
    const fallback = _comfyFallback(filename);
    return [fallback];
  }

  const results = [];
  try {
    for (const f of outputFilenames) {
      const sourcePath = path.join(COMFYUI_REAL_OUTPUT_DIR, f);
      const destPath = path.join(backendDir, "output", f);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        results.push(`/output/${f}`);
      }
    }
    console.log(`✅ COMFYUI: Copied ${results.length} files to local output.`);
  } catch (e) {
    console.error(`❌ COMFYUI: Copy failed:`, e.message);
    const fallback = _comfyFallback(filename);
    return [fallback];
  }

  return results;
}
