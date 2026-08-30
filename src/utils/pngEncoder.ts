/**
 * PNG encoder/decoder with embedded JSON metadata.
 * Uses PNG tEXt chunks to embed graph data, similar to how DrawIO embeds XML.
 */
import { toPng } from 'html-to-image';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const TEXT_CHUNK_TYPE = new Uint8Array([116, 69, 88, 116]); // "tEXt"
export const DATAFLOW_KEYWORD = 'dataflow-graph';
export const MINDMAP_KEYWORD = 'mindmap-graph';
const SUPPORTED_KEYWORDS = [DATAFLOW_KEYWORD, MINDMAP_KEYWORD];

/**
 * Calculate CRC32 for PNG chunk verification
 */
function crc32(data: Uint8Array): number {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;
  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

interface PngChunk {
  /** Offset of the 4-byte length field */
  start: number;
  /** Offset just past the CRC (start of the next chunk) */
  end: number;
  type: string;
  dataStart: number;
  dataLength: number;
}

/**
 * Iterate PNG chunks safely. Chunk lengths are read as unsigned and bounds-checked
 * so a corrupt or crafted file can never cause a backwards/zero step (infinite loop)
 * or an out-of-bounds slice — iteration just stops at the first malformed chunk.
 */
function* iteratePngChunks(pngData: Uint8Array): Generator<PngChunk> {
  let pos = 8; // skip signature
  while (pos + 12 <= pngData.length) {
    const length =
      ((pngData[pos] << 24) | (pngData[pos + 1] << 16) | (pngData[pos + 2] << 8) | pngData[pos + 3]) >>> 0;
    const end = pos + 12 + length; // 4 (length) + 4 (type) + data + 4 (crc)
    if (end > pngData.length) break;
    const type = String.fromCharCode(pngData[pos + 4], pngData[pos + 5], pngData[pos + 6], pngData[pos + 7]);
    yield { start: pos, end, type, dataStart: pos + 8, dataLength: length };
    if (type === 'IEND') break;
    pos = end;
  }
}

/**
 * Read the keyword of a tEXt chunk (text before the null separator), or null if malformed.
 */
function readTextChunkKeyword(pngData: Uint8Array, chunk: PngChunk): string | null {
  const data = pngData.subarray(chunk.dataStart, chunk.dataStart + chunk.dataLength);
  const nullPos = data.indexOf(0);
  if (nullPos === -1) return null;
  return new TextDecoder().decode(data.slice(0, nullPos));
}

/**
 * Create a tEXt chunk with the given keyword and text
 */
function createTextChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);

  // tEXt chunk: keyword + null separator + text
  const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0; // Null separator
  chunkData.set(textBytes, keywordBytes.length + 1);

  // Full chunk: length (4) + type (4) + data + crc (4)
  const length = chunkData.length;
  const chunk = new Uint8Array(4 + 4 + length + 4);

  // Length (big-endian)
  chunk[0] = (length >>> 24) & 0xff;
  chunk[1] = (length >>> 16) & 0xff;
  chunk[2] = (length >>> 8) & 0xff;
  chunk[3] = length & 0xff;

  // Type
  chunk.set(TEXT_CHUNK_TYPE, 4);

  // Data
  chunk.set(chunkData, 8);

  // CRC (over type + data)
  const crcData = new Uint8Array(4 + length);
  crcData.set(TEXT_CHUNK_TYPE, 0);
  crcData.set(chunkData, 4);
  const crc = crc32(crcData);
  chunk[8 + length] = (crc >>> 24) & 0xff;
  chunk[8 + length + 1] = (crc >>> 16) & 0xff;
  chunk[8 + length + 2] = (crc >>> 8) & 0xff;
  chunk[8 + length + 3] = crc & 0xff;

  return chunk;
}

/**
 * Embed JSON data into a PNG blob
 * @param pngBlob The PNG blob to embed data into
 * @param jsonData The JSON string to embed
 * @param keyword Optional keyword for the tEXt chunk (defaults to 'dataflow-graph')
 */
export async function embedJsonInPng(pngBlob: Blob, jsonData: string, keyword: string = DATAFLOW_KEYWORD): Promise<Blob> {
  const arrayBuffer = await pngBlob.arrayBuffer();
  const pngData = new Uint8Array(arrayBuffer);

  // Verify PNG signature
  for (let i = 0; i < 8; i++) {
    if (pngData[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Invalid PNG signature');
    }
  }

  // Find IEND and any previously embedded diagram chunks (stale data must not
  // survive a re-embed, or extraction would keep returning the old graph)
  let iendPos = -1;
  const staleChunks: PngChunk[] = [];
  for (const chunk of iteratePngChunks(pngData)) {
    if (chunk.type === 'IEND') {
      iendPos = chunk.start;
      break;
    }
    if (chunk.type === 'tEXt') {
      const chunkKeyword = readTextChunkKeyword(pngData, chunk);
      if (chunkKeyword && SUPPORTED_KEYWORDS.includes(chunkKeyword)) {
        staleChunks.push(chunk);
      }
    }
  }

  if (iendPos === -1) {
    throw new Error('PNG IEND chunk not found');
  }

  // Create tEXt chunk with compressed JSON (base64 encoded)
  const compressedJson = btoa(encodeURIComponent(jsonData));
  const textChunk = createTextChunk(keyword, compressedJson);

  // Combine: PNG before IEND (minus stale diagram chunks) + tEXt chunk + IEND chunk
  const keptParts: Uint8Array[] = [];
  let cursor = 0;
  for (const stale of staleChunks) {
    keptParts.push(pngData.subarray(cursor, stale.start));
    cursor = stale.end;
  }
  keptParts.push(pngData.subarray(cursor, iendPos));
  keptParts.push(textChunk);
  keptParts.push(pngData.subarray(iendPos));

  const totalLength = keptParts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of keptParts) {
    result.set(part, offset);
    offset += part.length;
  }

  return new Blob([result], { type: 'image/png' });
}

/**
 * Extract JSON data from a PNG blob
 * @param keywords Which embedded diagram keywords to accept — pass a single
 *   keyword to avoid cross-loading (e.g. a mindmap PNG renamed .dataflow.png)
 */
export async function extractJsonFromPng(pngBlob: Blob, keywords: string[] = SUPPORTED_KEYWORDS): Promise<string | null> {
  const arrayBuffer = await pngBlob.arrayBuffer();
  const pngData = new Uint8Array(arrayBuffer);

  // Verify PNG signature
  for (let i = 0; i < 8; i++) {
    if (pngData[i] !== PNG_SIGNATURE[i]) {
      return null; // Not a valid PNG
    }
  }

  // Parse chunks to find our tEXt chunk
  for (const chunk of iteratePngChunks(pngData)) {
    if (chunk.type !== 'tEXt') continue;

    const keyword = readTextChunkKeyword(pngData, chunk);
    if (!keyword || !keywords.includes(keyword)) continue;

    const chunkData = pngData.subarray(chunk.dataStart, chunk.dataStart + chunk.dataLength);
    const textData = new TextDecoder().decode(chunkData.slice(keyword.length + 1));
    // Decode the compressed JSON
    try {
      return decodeURIComponent(atob(textData));
    } catch {
      return textData; // Return as-is if not base64 encoded
    }
  }

  return null; // No dataflow data found
}

/**
 * Capture the React Flow canvas as a PNG blob using html-to-image
 * This properly handles the CSS transforms used by React Flow
 */
export async function captureCanvasToBlob(
  element: HTMLElement,
  options: {
    scale?: number;
    backgroundColor?: string;
    width?: number;
    height?: number;
  } = {}
): Promise<Blob> {
  const { scale = 2, backgroundColor = '#f8fafc', width, height } = options;

  // Use html-to-image for proper capture
  const dataUrl = await toPng(element, {
    pixelRatio: scale,
    backgroundColor,
    width,
    height,
    style: {
      // Ensure the element is visible and properly sized
      width: width ? `${width}px` : undefined,
      height: height ? `${height}px` : undefined,
    },
    filter: (node) => {
      // Exclude controls, minimap, and other UI elements from the export
      if (node instanceof HTMLElement) {
        const className = node.className;
        if (typeof className === 'string') {
          // Keep the core viewport content, exclude UI overlays
          if (className.includes('react-flow__controls') ||
              className.includes('react-flow__minimap') ||
              className.includes('react-flow__attribution') ||
              className.includes('react-flow__panel')) {
            return false;
          }
        }
      }
      return true;
    },
  });

  // Convert data URL to blob
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Calculate bounds for all nodes with padding
 */
export function calculateNodesBounds(
  nodes: Array<{ position: { x: number; y: number }; measured?: { width?: number; height?: number } }>
): { x: number; y: number; width: number; height: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const nodeWidth = node.measured?.width || 280;
    const nodeHeight = node.measured?.height || 200;

    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + nodeWidth);
    maxY = Math.max(maxY, node.position.y + nodeHeight);
  }

  // Add padding
  const padding = 50;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * Check if a file is a dataflow PNG
 */
export function isDataflowPng(filename: string): boolean {
  return filename.endsWith('.dataflow.png');
}

/**
 * Check if a file is a mindmap PNG
 */
export function isMindmapPng(filename: string): boolean {
  return filename.endsWith('.mindmap.png');
}

/**
 * Check if a file is any type of embedded diagram PNG
 */
export function isDiagramPng(filename: string): boolean {
  return isDataflowPng(filename) || isMindmapPng(filename);
}
