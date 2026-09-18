const test = require('node:test');
const assert = require('node:assert/strict');
const { urgencyRank } = require('../js/lib.js');

const REF = new Date(2026, 8, 15); // 15 sep 2026

function sortByUrgency(list, ref) {
    return list.slice().sort((a, b) => urgencyRank(b, ref) - urgencyRank(a, ref));
}

test('urgencyRank: meest te laat komt bovenaan', () => {
    const jamiroquai = { name: 'Jamiroquai', frequency: 60, interactions: [{ date: '2026-06-10', planned: false }] };
    const snobisme   = { name: 'Snobisme',   frequency: 10, interactions: [{ date: '2026-09-04', planned: false }] };
    const sorted = sortByUrgency([snobisme, jamiroquai], REF);
    assert.deepEqual(sorted.map(c => c.name), ['Jamiroquai', 'Snobisme']);
});

test('urgencyRank: nooit-contact (null) valt onderaan', () => {
    const jamiroquai = { name: 'Jamiroquai', frequency: 60, interactions: [{ date: '2026-06-10', planned: false }] };
    const developer  = { name: 'Developer',  frequency: 90, interactions: [] };
    const snobisme   = { name: 'Snobisme',   frequency: 10, interactions: [{ date: '2026-09-04', planned: false }] };
    const sorted = sortByUrgency([developer, snobisme, jamiroquai], REF);
    assert.deepEqual(sorted.map(c => c.name), ['Jamiroquai', 'Snobisme', 'Developer']);
});

test('urgencyRank: op-schema onder late maar boven nooit-contact', () => {
    const opSchema = { name: 'OpSchema', frequency: 200, interactions: [{ date: '2026-09-01', planned: false }] };
    const teLaat = { name: 'TeLaat', frequency: 30, interactions: [{ date: '2026-07-01', planned: false }] };
    const nooit = { name: 'Nooit', frequency: 30, interactions: [] };
    const sorted = sortByUrgency([nooit, opSchema, teLaat], REF);
    assert.deepEqual(sorted.map(c => c.name), ['TeLaat', 'OpSchema', 'Nooit']);
});

test('urgencyRank: gelijke dagen te laat behoudt stabiele volgorde', () => {
    const a = { name: 'A', frequency: 30, interactions: [{ date: '2026-08-01', planned: false }] };
    const b = { name: 'B', frequency: 30, interactions: [{ date: '2026-08-01', planned: false }] };
    // Node's Array#sort is stabiel: bij tie blijft input-volgorde
    const sorted = sortByUrgency([a, b], REF);
    assert.deepEqual(sorted.map(c => c.name), ['A', 'B']);
    const sorted2 = sortByUrgency([b, a], REF);
    assert.deepEqual(sorted2.map(c => c.name), ['B', 'A']);
});
