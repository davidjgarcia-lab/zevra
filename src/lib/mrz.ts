// Lectura de la zona MRZ (3 líneas × 30 caracteres, formato TD1) del reverso del DNI español.
// Valida los dígitos de control ICAO 9303 para asegurar que la fecha leída es la impresa en el documento.

export interface MrzResult {
  docNumber: string;
  dniNumber: string | null;   // 8 cifras + letra (si viene en la MRZ)
  birthdate: string;          // AAAA-MM-DD
  expiry: string | null;      // AAAA-MM-DD (null = permanente)
  sex: string;
  nationality: string;
  issuer: string;
  surname: string;
  givenNames: string;
  lines: [string, string, string];
}

const VAL = (c: string) => (c === '<' ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55);
export function checkDigit(s: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += VAL(s[i]) * w[i % 3];
  return sum % 10;
}

const DIGIT_FIX: Record<string, string> = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', J: '1', Z: '2', S: '5', G: '6', B: '8', T: '7', A: '4' };
const LETTER_FIX: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G' };

const toDigits = (s: string) => s.replace(/[^0-9]/g, (c) => DIGIT_FIX[c] ?? c);
const toLetters = (s: string) => s.replace(/[0-9]/g, (c) => LETTER_FIX[c] ?? c);

export const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
export function validDni(dni: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(dni);
  return !!m && DNI_LETTERS[Number(m[1]) % 23] === m[2];
}

function normLine(raw: string): string {
  return raw.toUpperCase()
    .replace(/[«‹(\[{]/g, '<')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '');
}

function fit(s: string): string {
  if (s.length > 30) s = s.slice(0, 30);
  return s.padEnd(30, '<');
}

function yymmdd(s: string, kind: 'birth' | 'expiry', now = new Date()): string | null {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = Number(s.slice(0, 2)), mm = Number(s.slice(2, 4)), dd = Number(s.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const cur = now.getFullYear() % 100;
  const year = kind === 'birth' ? (yy > cur ? 1900 + yy : 2000 + yy) : 2000 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** Corrige confusiones típicas del OCR según el tipo de carácter esperado en cada posición. */
function repair(l1: string, l2: string, l3: string, esp: boolean): [string, string, string] {
  // línea 1: tipo(2) país(3) nºdoc(9) control(1) opcional(15)
  l1 = toLetters(l1.slice(0, 5)) + l1.slice(5, 14) + toDigits(l1.slice(14, 15)) + l1.slice(15);
  if (esp && l1.slice(2, 5) === 'ESP') {
    // DNI español: nº de soporte = 3 letras + 6 cifras; opcional = nº DNI (8 cifras + letra)
    l1 = l1.slice(0, 5) + toLetters(l1.slice(5, 8)) + toDigits(l1.slice(8, 14)) + l1.slice(14, 15) +
         toDigits(l1.slice(15, 23)) + toLetters(l1.slice(23, 24)) + l1.slice(24);
  }
  // línea 2: nac.(6)+c(1) sexo(1) caduc.(6)+c(1) nacionalidad(3) opcional(11) control final(1)
  l2 = toDigits(l2.slice(0, 7)) + l2.slice(7, 8).replace('H', 'M') + toDigits(l2.slice(8, 15)) +
       toLetters(l2.slice(15, 18)) + l2.slice(18, 29) + toDigits(l2.slice(29, 30));
  l3 = toLetters(l3);
  return [l1, l2, l3];
}

function variants(line: string): string[] {
  // El OCR a veces añade un carácter de más: probar quitando uno
  if (line.length <= 30 || line.length > 33) return [line];
  const out = [line];
  for (let i = 0; i < line.length; i++) out.push(line.slice(0, i) + line.slice(i + 1));
  return out;
}

export function parseTD1(input: [string, string, string], now = new Date()): MrzResult | null {
  const [a, b, c] = input.map(normLine);
  const l3 = fit(c);
  for (const strict of [true, false]) {
    for (const l1 of variants(a)) for (const l2 of variants(b)) {
      const base: [string, string, string] = [fit(l1), fit(l2), l3];
      const r = parseFixed(...repair(...base, false), now, strict) ?? parseFixed(...repair(...base, true), now, strict);
      if (r) return r;
    }
  }
  return null;
}

function parseFixed(l1: string, l2: string, l3: string, now: Date, strict = true): MrzResult | null {
  if (!/^[AIC][A-Z<]/.test(l1)) return null;

  const docField = l1.slice(5, 14);
  const docCheck = l1.slice(14, 15);
  const birth = l2.slice(0, 6), birthCheck = l2.slice(6, 7);
  const exp = l2.slice(8, 14), expCheck = l2.slice(14, 15);
  if (String(checkDigit(docField)) !== docCheck) return null;
  if (String(checkDigit(birth)) !== birthCheck) return null;
  const permanent = /^9{6}$/.test(exp) || exp === '<<<<<<';
  if (!permanent && String(checkDigit(exp)) !== expCheck) return null;
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  // El dígito final (compuesto) se exige en la primera pasada; si el OCR lo leyó mal, bastan
  // los dígitos de control propios del nº de documento, la fecha de nacimiento y la caducidad.
  if (strict && String(checkDigit(composite)) !== l2.slice(29, 30)) return null;

  const birthdate = yymmdd(birth, 'birth', now);
  if (!birthdate) return null;
  const expiry = permanent ? null : yymmdd(exp, 'expiry', now);
  if (!permanent && !expiry) return null;

  const opt = l1.slice(15, 30).replace(/<+$/, '');
  const dni = /^\d{8}[A-Z]/.exec(opt)?.[0] ?? null;
  const [sur, given = ''] = l3.split('<<');
  return {
    docNumber: docField.replace(/<+$/, ''),
    dniNumber: dni && validDni(dni) ? dni : null,
    birthdate, expiry,
    sex: l2[7] === '<' ? '' : l2[7],
    nationality: l2.slice(15, 18).replace(/</g, ''),
    issuer: l1.slice(2, 5).replace(/</g, ''),
    surname: sur.replace(/</g, ' ').trim(),
    givenNames: given.replace(/</g, ' ').trim(),
    lines: [l1, l2, l3],
  };
}

/** Busca la MRZ dentro del texto completo devuelto por el OCR. */
export function findMrz(text: string, now = new Date()): MrzResult | null {
  const lines = text.split(/\r?\n/).map(normLine).filter((l) => l.length >= 20);
  for (let i = 0; i + 2 < lines.length; i++) {
    const r = parseTD1([lines[i], lines[i + 1], lines[i + 2]], now);
    if (r) return r;
  }
  // Si el OCR juntó o partió líneas, probar con el texto continuo
  const flat = lines.join('');
  for (let s = 0; s + 90 <= flat.length; s++) {
    const r = parseTD1([flat.slice(s, s + 30), flat.slice(s + 30, s + 60), flat.slice(s + 60, s + 90)], now);
    if (r) return r;
  }
  return null;
}

export function ageOn(birthdate: string, now = new Date()): number {
  const [y, m, d] = birthdate.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/** Construye una MRZ válida (para pruebas y ejemplos). */
export function buildTD1(o: { doc: string; dni: string; birth: string; sex: string; expiry: string; surname: string; given: string }): [string, string, string] {
  const docF = o.doc.padEnd(9, '<');
  const l1 = fit('IDESP' + docF + checkDigit(docF) + o.dni);
  const l2a = o.birth + checkDigit(o.birth) + o.sex + o.expiry + checkDigit(o.expiry) + 'ESP';
  const l2b = ''.padEnd(11, '<');
  const comp = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2b;
  const l2 = l2a + l2b + checkDigit(comp);
  const l3 = fit(o.surname.replace(/ /g, '<') + '<<' + o.given.replace(/ /g, '<'));
  return [l1, l2, l3];
}
