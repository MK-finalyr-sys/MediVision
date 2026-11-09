export function luminance(data: Uint8ClampedArray): Float64Array { const gray = new Float64Array(data.length / 4); for (let i = 0; i < gray.length; i++) gray[i] = .299 * data[i * 4] + .587 * data[i * 4 + 1] + .114 * data[i * 4 + 2]; return gray; }
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3 || gray.length !== width * height) return 0;
  let sum = 0, squares = 0, n = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) { const i = y * width + x; const value = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]; sum += value; squares += value * value; n++; }
  return n ? Math.max(0, squares / n - (sum / n) ** 2) : 0;
}
export function isBlurry(variance: number) { return variance < 45; }
export function contrastStretch(data: Uint8ClampedArray): Uint8ClampedArray {
  const gray = luminance(data); const sorted = Float64Array.from(gray).sort();
  const low = sorted[Math.floor(sorted.length * .01)] || 0; const high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .99))] || 255;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < gray.length; i++) { const v = Math.max(0, Math.min(255, (gray[i] - low) * 255 / Math.max(1, high - low))); out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255; } return out;
}
export async function preprocessImage(file: Blob): Promise<{ before: string; after: string; canvas: HTMLCanvasElement; variance: number; hash: string }> {
  if (!file.size) throw new Error("This photo is empty. Please take a new photo.");
  if (file.size > 25 * 1024 * 1024) throw new Error("This photo is too large. Choose a photo smaller than 25 MB.");
  if (file.type && !file.type.startsWith("image/")) throw new Error("Please choose an image, not a document or video.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { throw new Error("This image format could not be opened. Try a JPEG or PNG photo."); }
  if (bitmap.width < 100 || bitmap.height < 100) { bitmap.close(); throw new Error("This photo is too small to read. Please take a closer, higher-resolution photo."); }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) { bitmap.close(); throw new Error("Photo processing is unavailable in this browser. Use manual search instead."); }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = luminance(image.data);
  let min = 255, max = 0; for (const v of gray) { min = Math.min(min, v); max = Math.max(max, v); }
  if (max - min < 18) throw new Error("No readable detail was found. Photograph the printed side of one medicine strip.");
  let hash = 2166136261; for (let i = 0; i < image.data.length; i++) hash = Math.imul(hash ^ image.data[i], 16777619);
  const before = canvas.toDataURL("image/jpeg", .8);
  const variance = laplacianVariance(gray, canvas.width, canvas.height);
  image.data.set(contrastStretch(image.data)); ctx.putImageData(image, 0, 0);
  return { before, after: canvas.toDataURL("image/jpeg", .85), canvas, variance, hash: `${canvas.width}x${canvas.height}:${hash >>> 0}` };
}
