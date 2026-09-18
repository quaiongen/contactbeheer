const test = require('node:test');
const assert = require('node:assert/strict');
const {
    formatUrgencyLabel,
    formatAttemptLabel,
    formatPlannedDateShort,
    dagWoord
} = require('../js/lib.js');

const REF = new Date(2026, 8, 15); // 15 sep 2026

test('formatUrgencyLabel: null → "nog geen contact"', () => {
    assert.equal(formatUrgencyLabel(null), 'nog geen contact');
    assert.equal(formatUrgencyLabel(undefined), 'nog geen contact');
});

test('formatUrgencyLabel: 0 → "vandaag"', () => {
    assert.equal(formatUrgencyLabel(0), 'vandaag');
});

test('formatUrgencyLabel: positief → "{n} dagen te laat" met enkelvoud voor 1', () => {
    assert.equal(formatUrgencyLabel(1), '1 dag te laat');
    assert.equal(formatUrgencyLabel(2), '2 dagen te laat');
    assert.equal(formatUrgencyLabel(38), '38 dagen te laat');
    assert.equal(formatUrgencyLabel(365), '365 dagen te laat');
});

test('formatUrgencyLabel: negatief → "over {n} dagen" met enkelvoud voor 1', () => {
    assert.equal(formatUrgencyLabel(-1), 'over 1 dag');
    assert.equal(formatUrgencyLabel(-9), 'over 9 dagen');
    assert.equal(formatUrgencyLabel(-30), 'over 30 dagen');
});

test('formatAttemptLabel: null → null', () => {
    assert.equal(formatAttemptLabel(null, REF), null);
});

test('formatAttemptLabel: poging van vandaag → "Verb, vandaag"', () => {
    const bellen = { kanaal: 'bellen', created_at: new Date(2026, 8, 15, 9).toISOString() };
    const wapp = { kanaal: 'whatsapp', created_at: new Date(2026, 8, 15, 12).toISOString() };
    const mail = { kanaal: 'mail', created_at: new Date(2026, 8, 15, 14).toISOString() };
    assert.equal(formatAttemptLabel(bellen, REF), 'Gebeld, vandaag');
    assert.equal(formatAttemptLabel(wapp, REF), 'Geappt, vandaag');
    assert.equal(formatAttemptLabel(mail, REF), 'Gemaild, vandaag');
});

test('formatAttemptLabel: 1 dag terug → "Verb, 1 dag geleden"', () => {
    const a = { kanaal: 'whatsapp', created_at: new Date(2026, 8, 14, 9).toISOString() };
    assert.equal(formatAttemptLabel(a, REF), 'Geappt, 1 dag geleden');
});

test('formatAttemptLabel: meerdere dagen → "Verb, N dagen geleden"', () => {
    const a = { kanaal: 'mail', created_at: new Date(2026, 8, 12, 9).toISOString() };
    assert.equal(formatAttemptLabel(a, REF), 'Gemaild, 3 dagen geleden');
});

test('formatAttemptLabel: onbekend kanaal → gebruikt kanaal-string als verb', () => {
    const a = { kanaal: 'sms', created_at: new Date(2026, 8, 15, 9).toISOString() };
    assert.equal(formatAttemptLabel(a, REF), 'sms, vandaag');
});

test('formatPlannedDateShort: vandaag / morgen / weekdag / lange datum', () => {
    assert.equal(formatPlannedDateShort('2026-09-15', REF), 'vandaag');
    assert.equal(formatPlannedDateShort('2026-09-16', REF), 'morgen');
    // 17 sep 2026 = donderdag
    assert.equal(formatPlannedDateShort('2026-09-17', REF), 'do');
    // 25 sep 2026 = meer dan 7 dagen weg
    assert.equal(formatPlannedDateShort('2026-09-25', REF), '25 sep');
    assert.equal(formatPlannedDateShort('2026-12-25', REF), '25 dec');
});

test('dagWoord: enkelvoud vs meervoud', () => {
    assert.equal(dagWoord(1), 'dag');
    assert.equal(dagWoord(0), 'dagen');
    assert.equal(dagWoord(2), 'dagen');
    assert.equal(dagWoord(100), 'dagen');
});
