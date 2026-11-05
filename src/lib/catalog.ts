// Catálogos de identidad, orientación, deseos y países.

export const GENDER_LIST: Array<[string, string]> = [
  ['mujer', 'Mujer'], ['hombre', 'Hombre'], ['no_binario', 'No binario'], ['agenero', 'Agénero'],
  ['androgino', 'Andrógino/a'], ['bigenero', 'Bigénero'], ['genero_fluido', 'Género fluido'],
  ['genero_no_conforme', 'Género no conforme'], ['genderqueer', 'Genderqueer'], ['cuestionamiento', 'En cuestionamiento'],
  ['intersexual', 'Intersexual'], ['pangenero', 'Pangénero'], ['transfemenina', 'Transfemenina'],
  ['transmasculina', 'Transmasculina'], ['persona_trans', 'Persona trans'], ['otro', 'Otro'],
  ['pareja_hm', 'Pareja de hombre y mujer'], ['pareja_hh', 'Pareja de hombre y hombre'], ['pareja_mm', 'Pareja de mujer y mujer'],
];
export const genderLabel = (g?: string | null) => GENDER_LIST.find(([k]) => k === g)?.[1] ?? '';

export const SEXUALITIES = ['Heterosexual', 'Gay', 'Lesbiana', 'Bisexual', 'Pansexual', 'Queer', 'Asexual', 'Demisexual',
  'Heteroflexible', 'Homoflexible', 'Sapiosexual', 'En cuestionamiento'];

export const DESIRE_GROUPS: Array<{ title: string; items: string[] }> = [
  { title: 'Conexión', items: ['Amistad', 'Conversación', 'Coqueteo', 'Citas', 'Relación', 'Monogamia', 'No monogamia', 'Poliamor', 'Relación abierta'] },
  { title: 'Encuentros', items: ['Exploración', 'Diversión', 'Sexting', 'Mensajes picantes', 'Videollamadas', 'Encuentro casual', 'Solo online'] },
  { title: 'Dinámicas en grupo', items: ['Trío', 'Grupo', 'Pareja que busca', 'Intercambio de parejas', 'Fiestas'] },
  { title: 'Kink y fantasía', items: ['BDSM', 'Dominante', 'Sumiso/a', 'Switch', 'Brat', 'Bondage', 'Juego de rol', 'Juguetes', 'Vainilla', 'Voyeurismo', 'Exhibicionismo', 'Fetiches', 'Tántrico', 'Sensual'] },
];

// Códigos ISO 3166-1 alfa-2
const CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

let names: Intl.DisplayNames | null = null;
try { names = new Intl.DisplayNames(['es'], { type: 'region' }); } catch { /* navegador antiguo */ }
export const countryName = (c?: string | null) => (c ? (names?.of(c) ?? c) : '');
export const flag = (c?: string | null) =>
  c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '🌍';

// Países frecuentes primero, después el resto por orden alfabético
const TOP = ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'UY', 'US', 'FR', 'IT', 'PT', 'DE', 'GB'];
export const COUNTRIES: Array<[string, string]> = [
  ...TOP.map((c) => [c, countryName(c)] as [string, string]),
  ...CODES.filter((c) => !TOP.includes(c)).map((c) => [c, countryName(c)] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], 'es')),
];

const TZ: Record<string, string> = {
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES', 'America/Mexico_City': 'MX', 'America/Monterrey': 'MX',
  'America/Tijuana': 'MX', 'America/Cancun': 'MX', 'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO',
  'America/Santiago': 'CL', 'America/Lima': 'PE', 'America/Caracas': 'VE', 'America/Guayaquil': 'EC', 'America/Montevideo': 'UY',
  'America/Asuncion': 'PY', 'America/La_Paz': 'BO', 'America/Havana': 'CU', 'America/Santo_Domingo': 'DO', 'America/Panama': 'PA',
  'America/Costa_Rica': 'CR', 'America/Guatemala': 'GT', 'America/El_Salvador': 'SV', 'America/Tegucigalpa': 'HN',
  'America/Managua': 'NI', 'America/Puerto_Rico': 'PR', 'Europe/Paris': 'FR', 'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT',
  'Europe/Berlin': 'DE', 'Europe/London': 'GB', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH',
};

/** País sugerido: 1) por la IP (función de Netlify), 2) zona horaria e idioma del móvil. El usuario puede corregirlo. */
export async function detectCountry(): Promise<string | null> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
    // En la app nativa se consulta la web publicada; en el navegador, la misma web
    const base = location.protocol === 'https:' && !/^localhost$/.test(location.hostname) ? '' : 'https://zevradate.netlify.app';
    const r = await fetch(`${base}/api/geo`, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (r.ok) { const j = await r.json(); if (j?.country && /^[A-Z]{2}$/.test(j.country)) return j.country; }
  } catch { /* sin conexión o en la app nativa */ }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ[tz]) return TZ[tz];
  } catch { /* */ }
  const region = (navigator.language || '').split('-')[1]?.toUpperCase();
  return region && CODES.includes(region) ? region : null;
}
