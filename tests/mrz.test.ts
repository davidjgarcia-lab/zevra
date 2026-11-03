import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTD1, parseTD1, findMrz, ageOn, checkDigit, validDni } from '../src/lib/mrz.ts';

const now = new Date('2026-11-03T12:00:00Z');
const sample = buildTD1({ doc: 'BAA000589', dni: '99999999R', birth: '900514', sex: 'F', expiry: '310101', surname: 'ESPANOLA ESPANOLA', given: 'CARMEN' });

test('check digit ICAO', () => {
  assert.equal(checkDigit('520727'), 3);
  assert.equal(checkDigit('L898902C3'), 6);
});
test('DNI letra', () => { assert.ok(validDni('99999999R')); assert.ok(!validDni('99999999T')); });
test('MRZ válida', () => {
  const r = parseTD1(sample, now)!;
  assert.equal(r.birthdate, '1990-05-14');
  assert.equal(r.expiry, '2031-01-01');
  assert.equal(r.dniNumber, '99999999R');
  assert.equal(r.surname, 'ESPANOLA ESPANOLA');
  assert.equal(r.givenNames, 'CARMEN');
  assert.equal(ageOn(r.birthdate, now), 36);
});
test('fecha manipulada se rechaza', () => {
  const bad = [sample[0], sample[1].replace(/^900514/, '000514'), sample[2]] as [string, string, string];
  assert.equal(parseTD1(bad, now), null);
});
test('OCR con ruido (O por 0, espacios, minúsculas)', () => {
  const noisy = `REINO DE ESPAÑA\n${sample[0].replace(/0/g, 'O').toLowerCase()}\n ${sample[1].replace(/0/g, 'O').split('').join(' ')} \n${sample[2]}\n`;
  const r = findMrz(noisy, now)!;
  assert.ok(r); assert.equal(r.birthdate, '1990-05-14');
});
test('menor de edad detectable', () => {
  const kid = buildTD1({ doc: 'CAB123456', dni: '12345678Z', birth: '100101', sex: 'M', expiry: '300101', surname: 'NINO', given: 'PEPE' });
  const r = parseTD1(kid, now)!;
  assert.equal(r.birthdate, '2010-01-01');
  assert.ok(ageOn(r.birthdate, now) < 18);
});
test('salidas reales del OCR con errores (carácter de más, último dígito mal)', () => {
  const a = findMrz('IDESPBAAOOOS589599999999R<<<<<<\n9005145F3101012ESP<<<<<<<<<<<5H\nESPANOLA<ESPANOLA<<CARMEN<<<<<', now);
  const b = findMrz('IDESPBAAOOO589599999999R<<<<<<\n9005145F3101012ESP<<<<<<<<<<<O\nESPANOLA<ESPANOLA<<CARMEN<<<<<', now);
  assert.equal(a?.birthdate, '1990-05-14');
  assert.equal(b?.birthdate, '1990-05-14');
});
test('basura no se acepta', () => {
  assert.equal(findMrz('DESPBAABEO589509999999R<<7C\nS145F3101012ESPS<<<TE\nPANOLA<ESPANOLA<<CARMENSSSSS', now), null);
});
