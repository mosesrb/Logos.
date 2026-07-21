import path from "path";

/**
 * Resolves an untrusted user input path against a trusted base directory.
 * Prevents directory traversal (..) and absolute path injection.
 * 
 * @param {string} baseDir The trusted root directory (e.g., UPLOADS_DIR)
 * @param {string} userInput The untrusted file or folder name
 * @returns {string} The safely resolved absolute path
 * @throws {Error} If the path attempts to escape the baseDir
 */
export function resolveSafePath(baseDir, userInput) {
  if (!baseDir || typeof baseDir !== 'string') {
    throw new Error("resolveSafePath requires a valid baseDir string");
  }
  if (!userInput || typeof userInput !== 'string') {
    throw new Error("resolveSafePath requires a valid userInput string");
  }

  const resolved = path.resolve(baseDir, userInput);
  const relative = path.relative(baseDir, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Security Exception: Path traversal detected. ${userInput}`);
  }

  return resolved;
}
