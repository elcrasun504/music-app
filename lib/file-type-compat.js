/**
 * Compatibilidad con distintas versiones del paquete `file-type`.
 *
 * - En file-type v16.x (CommonJS) la función se llama `fromBuffer`.
 * - Desde file-type v17.x (paquete ESM-only) la función se renombró a
 *   `fileTypeFromBuffer`.
 *
 * Este helper detecta cuál está disponible en el paquete realmente
 * instalado y siempre expone la misma función `detectFileType(buffer)`,
 * para no volver a romper la subida de archivos si el paquete cambia
 * de versión en el futuro.
 */

let cachedDetector = null;

async function loadDetector() {
  if (cachedDetector) {
    return cachedDetector;
  }

  const mod = await import('file-type');
  const source = mod && mod.default ? { ...mod.default, ...mod } : mod;

  const candidate = source.fileTypeFromBuffer || source.fromBuffer;

  if (typeof candidate !== 'function') {
    throw new Error(
      'No se encontró una función de detección de tipo de archivo compatible en el paquete "file-type" instalado.'
    );
  }

  cachedDetector = candidate;
  return cachedDetector;
}

/**
 * Detecta el tipo real de un archivo a partir de sus bytes.
 * @param {Buffer} buffer
 * @returns {Promise<{ext: string, mime: string} | null>}
 */
async function detectFileType(buffer) {
  try {
    const detector = await loadDetector();
    const result = await detector(buffer);
    return result || null;
  } catch (error) {
    console.error('[file-type-compat] Error al detectar el tipo real del archivo:', error && error.stack ? error.stack : error);
    return null;
  }
}

module.exports = { detectFileType };
