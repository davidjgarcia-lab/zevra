export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Reduce la foto (máx. 1600 px, JPEG) y elimina sus metadatos (ubicación GPS, modelo de móvil…). */
export async function compressImage(file: Blob, max = 1600, quality = 0.85): Promise<Blob> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bmp = await createImageBitmap(file); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality));
}

export const MAX_VIDEO_MB = 50;
export function videoExt(type: string) {
  if (type.includes('webm')) return 'webm';
  if (type.includes('quicktime')) return 'mov';
  return 'mp4';
}
