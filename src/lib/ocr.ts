import { findMrz, type MrzResult } from './mrz';

type Progress = (pct: number, label: string) => void;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { return await createImageBitmap(file); }
}

/** Prepara una zona de la foto para el OCR: escala de grises, contraste y tamaño adecuado. */
/** Endereza (ángulo en grados), recorta la parte inferior y amplía la zona de la MRZ. */
function prepare(bmp: ImageBitmap, cropTop: number, angle = 0): HTMLCanvasElement {
  const rad = (angle * Math.PI) / 180;
  const W = bmp.width, H = bmp.height;
  const rw = Math.ceil(Math.abs(W * Math.cos(rad)) + Math.abs(H * Math.sin(rad)));
  const rh = Math.ceil(Math.abs(W * Math.sin(rad)) + Math.abs(H * Math.cos(rad)));
  const rot = document.createElement('canvas'); rot.width = rw; rot.height = rh;
  const rg = rot.getContext('2d')!;
  rg.fillStyle = '#808080'; rg.fillRect(0, 0, rw, rh);
  rg.translate(rw / 2, rh / 2); rg.rotate(rad); rg.drawImage(bmp, -W / 2, -H / 2);
  const sy = Math.floor(rh * cropTop), sh = rh - sy;
  const scale = Math.min(2, 2400 / rw);
  const c = document.createElement('canvas');
  c.width = Math.round(rw * scale); c.height = Math.round(sh * scale);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(rot, 0, sy, rw, sh, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height); const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = y; if (y < min) min = y; if (y > max) max = y; }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) { const v = Math.min(255, Math.max(0, ((d[i] - min) / range) * 255)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0);
  return c;
}

/** Lee la MRZ del reverso del DNI a partir de una foto. */
export async function readDniBack(file: Blob, onProgress: Progress): Promise<MrzResult | null> {
  onProgress(5, 'Preparando la imagen…');
  const bmp = await loadBitmap(file);
  const { createWorker, PSM } = await import('tesseract.js');
  onProgress(15, 'Cargando el lector…');
  let step = 0;
  const base = new URL('ocr/', document.baseURI).href;
  const worker = await createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(Math.min(95, 30 + step * 8 + Math.round(m.progress * 8)), 'Leyendo tu DNI…');
    },
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    // 1º la foto tal cual; después zonas recortadas/mejoradas y girada por si está del revés
    const attempts: Array<Blob | HTMLCanvasElement | (() => HTMLCanvasElement)> = [
      file, () => prepare(bmp, 0.45), () => prepare(bmp, 0.45, -3), () => prepare(bmp, 0.45, 3),
      () => prepare(bmp, 0.45, -6), () => prepare(bmp, 0.45, 6), () => prepare(bmp, 0, 180), () => prepare(bmp, 0.3, 90), () => prepare(bmp, 0.3, -90),
    ];
    for (const a of attempts) {
      const img = typeof a === 'function' ? a() : a;
      step++;
      const { data } = await worker.recognize(img);
      if (import.meta.env.DEV) console.debug('[ocr]', data.text);
      const r = findMrz(data.text);
      if (r) { onProgress(100, 'Listo'); return r; }
    }
    return null;
  } finally {
    await worker.terminate();
    bmp.close();
  }
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
