const test = require('node:test');
const assert = require('node:assert/strict');
const { presetSpec } = require('../js/lib.js');
const { parseTimeString, addMinutes, formatTimeString } = require('../js/lib.js');

test('parseTimeString: HH:MM → minutes-sinds-middernacht', () => {
    assert.equal(parseTimeString('00:00'), 0);
    assert.equal(parseTimeString('11:30'), 690);
    assert.equal(parseTimeString('23:59'), 1439);
});

test('formatTimeString: minutes → HH:MM (zero-padded)', () => {
    assert.equal(formatTimeString(0), '00:00');
    assert.equal(formatTimeString(690), '11:30');
    assert.equal(formatTimeString(1439), '23:59');
});

test('addMinutes: telt op zonder overflow-controle (voor slot-berekening)', () => {
    assert.equal(addMinutes('11:30', 90), '13:00');
    assert.equal(addMinutes('23:00', 30), '23:30');
});

test('presetSpec: lunch → 11:30-12:00 startvenster, 90 min, titel-template met contact', () => {
    const s = presetSpec('lunch');
    assert.equal(s.startVensterVan, '11:30');
    assert.equal(s.startVensterTot, '12:00');
    assert.equal(s.duur, 90);
    assert.equal(s.titelTemplate, 'Lunch met {naam}');
});

test('presetSpec: diner → 18:00-19:30 startvenster, 180 min', () => {
    const s = presetSpec('diner');
    assert.equal(s.startVensterVan, '18:00');
    assert.equal(s.startVensterTot, '19:30');
    assert.equal(s.duur, 180);
    assert.equal(s.titelTemplate, 'Diner met {naam}');
});

test('presetSpec: anders → eigen input, geen titel-template', () => {
    const s = presetSpec('anders', { starttijd: '14:00', duur: 60 });
    assert.equal(s.startVensterVan, '14:00');
    assert.equal(s.startVensterTot, '14:00');
    assert.equal(s.duur, 60);
    assert.equal(s.titelTemplate, null);
});

test('presetSpec: onbekende preset → null', () => {
    assert.equal(presetSpec('random'), null);
});
