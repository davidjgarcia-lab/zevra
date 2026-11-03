// Copia el lector OCR (tesseract) a public/ocr para que la app no dependa de ninguna CDN.
import { cpSync, mkdirSync } from 'node:fs';
const out = 'public/ocr';
mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];
for (const [from, to] of files) cpSync(from, `${out}/${to}`);
console.log('OCR copiado a', out);
