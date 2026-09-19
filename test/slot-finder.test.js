const test = require('node:test');
const assert = require('node:assert/strict');
const { presetSpec } = require('../js/lib.js');

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
