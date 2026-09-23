const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVCard, unescapeVCardText } = require('../js/lib.js');

const wrap = (...lines) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

test('parse: iPhone-export (FN, TEL;type=CELL, EMAIL)', () => {
    const [c] = parseVCard(wrap('FN:Anna Bloem', 'N:Bloem;Anna;;;', 'TEL;type=CELL;type=VOICE;type=pref:+31 6 12345678', 'EMAIL;type=INTERNET;type=HOME:Anna@Example.com'));
    assert.equal(c.FN, 'Anna Bloem');
    assert.equal(c.N, 'Bloem;Anna;;;');
    assert.deepEqual(c.TEL[0].params.type, ['CELL', 'VOICE', 'pref']);
    assert.equal(c.TEL[0].value, '+31 6 12345678');
    assert.equal(c.EMAIL[0].value, 'Anna@Example.com');
});

test('parse: Google-export met meerdere TEL en ORG', () => {
    const [c] = parseVCard(wrap('FN:Bart Jansen', 'ORG:Acme BV;Sales', 'TEL:0201234567', 'TEL;TYPE=CELL:0612345678'));
    assert.equal(c.TEL.length, 2);
    assert.equal(c.TEL[0].params.type, undefined);
    assert.equal(c.ORG, 'Acme BV');
});

test('parse: meerdere BEGIN:VCARD-blokken', () => {
    const text = wrap('FN:A') + '\r\n' + wrap('FN:B') + '\r\n';
    assert.deepEqual(parseVCard(text).map(c => c.FN), ['A', 'B']);
});

test('parse: line-folding, alle vier de varianten', () => {
    for (const fold of ['\r\n ', '\r\n\t', '\n ', '\n\t']) {
        const text = 'BEGIN:VCARD\nVERSION:3.0\nFN:Anna Bl' + fold + 'oem\nEND:VCARD';
        assert.equal(parseVCard(text)[0].FN, 'Anna Bloem', JSON.stringify(fold));
    }
});

test('parse: komma-gescheiden TYPE', () => {
    const [c] = parseVCard(wrap('FN:X', 'TEL;TYPE=CELL,VOICE:0612345678'));
    assert.deepEqual(c.TEL[0].params.type, ['CELL', 'VOICE']);
});

test('parse: kale type-parameter (vCard 2.1/3.0 stijl) en groep-prefix', () => {
    const [c] = parseVCard(wrap('FN:X', 'item1.TEL;CELL:0612345678'));
    assert.deepEqual(c.TEL[0].params.type, ['CELL']);
});

test('parse: vCard 4.0 tel:-prefix wordt gestript', () => {
    const [c] = parseVCard(wrap('FN:X', 'TEL:tel:+31612345678'));
    assert.equal(c.TEL[0].value, '+31612345678');
});

test('unescape: \\n, \\N, \\, \\; en \\\\', () => {
    assert.equal(unescapeVCardText('a\\nb'), 'a\nb');
    assert.equal(unescapeVCardText('a\\Nb'), 'a\nb');
    assert.equal(unescapeVCardText('a\\,b\\;c'), 'a,b;c');
    assert.equal(unescapeVCardText('a\\\\b'), 'a\\b');
});

test('unescape: \\\\n is een letterlijke backslash-n, geen newline', () => {
    assert.equal(unescapeVCardText('a\\\\nb'), 'a\\nb');
});

test('parse: NOTE wordt gedecodeerd', () => {
    const [c] = parseVCard(wrap('FN:X', 'NOTE:regel1\\nregel2\\, ok\\\\nlit'));
    assert.equal(c.NOTE, 'regel1\nregel2, ok\\nlit');
});

test('parse: BDAY komt raw terug (mapper beslist)', () => {
    for (const raw of ['1985-03-12', '19850312', '--0312', 'onzin']) {
        assert.equal(parseVCard(wrap('FN:X', 'BDAY:' + raw))[0].BDAY, raw);
    }
});

test('parse: leeg bestand → []', () => {
    assert.deepEqual(parseVCard(''), []);
    assert.deepEqual(parseVCard('   \n'), []);
});

test('parse: blok zonder END:VCARD → []', () => {
    assert.deepEqual(parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:X\n'), []);
});

test('parse: BOM aan het begin wordt genegeerd', () => {
    assert.equal(parseVCard('﻿' + wrap('FN:Anna'))[0].FN, 'Anna');
});

test('parse: onbekende velden en PHOTO breken niets', () => {
    const [c] = parseVCard(wrap('FN:X', 'PHOTO;ENCODING=b;TYPE=JPEG:AAAA', 'X-FOO:bar'));
    assert.equal(c.FN, 'X');
});
