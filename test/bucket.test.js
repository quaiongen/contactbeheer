const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BUCKETS,
    computeBucket,
    computeDagenTeLaat,
    getRecentAttempt,
    rightLabelClass,
    isPlannedForDate
} = require('../js/lib.js');

// Vaste referentiedatum — testen mogen niet meebewegen met de klok.
const REF = new Date(2026, 8, 15); // 15 sep 2026

test('bucket: geen enkele interactie → nooit_contact', () => {
    const c = { frequency: 90, interactions: [] };
    assert.equal(computeBucket(c, REF), BUCKETS.NOOIT_CONTACT);
    assert.equal(computeDagenTeLaat(c, REF), null);
});

test('bucket: toekomstige geplande afspraak → afspraak_staat_al ook al zwaar te laat', () => {
    const c = {
        frequency: 90,
        interactions: [
            { date: '2025-01-01', planned: false },
            { date: '2026-09-20', planned: true }
        ]
    };
    assert.equal(computeBucket(c, REF), BUCKETS.AFSPRAAK_STAAT_AL);
});

test('bucket: precies op de frequentie-grens → nu_afspraak_maken met dtl 0', () => {
    const c = { frequency: 30, interactions: [{ date: '2026-08-16', planned: false }] };
    assert.equal(computeBucket(c, REF), BUCKETS.NU_AFSPRAAK_MAKEN);
    assert.equal(computeDagenTeLaat(c, REF), 0);
});

test('bucket: 100 dagen sinds laatste contact, freq 60 → 40 dagen te laat', () => {
    const c = { frequency: 60, interactions: [{ date: '2026-06-07', planned: false }] };
    assert.equal(computeBucket(c, REF), BUCKETS.NU_AFSPRAAK_MAKEN);
    assert.equal(computeDagenTeLaat(c, REF), 40);
});

test('bucket: nog 10 dagen tot deadline → binnen_twee_weken', () => {
    const c = { frequency: 30, interactions: [{ date: '2026-08-26', planned: false }] };
    assert.equal(computeBucket(c, REF), BUCKETS.BINNEN_TWEE_WEKEN);
    assert.equal(computeDagenTeLaat(c, REF), -10);
});

test('bucket: nog 60 dagen tot deadline → op_schema', () => {
    const c = { frequency: 90, interactions: [{ date: '2026-08-16', planned: false }] };
    assert.equal(computeBucket(c, REF), BUCKETS.OP_SCHEMA);
    assert.equal(computeDagenTeLaat(c, REF), -60);
});

test('bucket: geplande interactie in het verleden telt als contact', () => {
    const c = { frequency: 30, interactions: [{ date: '2026-08-25', planned: true }] };
    assert.equal(computeBucket(c, REF), BUCKETS.BINNEN_TWEE_WEKEN);
    assert.equal(computeDagenTeLaat(c, REF), -9);
});

test('bucket: exact 14 dagen tot deadline → binnen_twee_weken (inclusief bovengrens)', () => {
    const c = { frequency: 30, interactions: [{ date: '2026-08-30', planned: false }] };
    assert.equal(computeBucket(c, REF), BUCKETS.BINNEN_TWEE_WEKEN);
});

test('bucket: 15 dagen tot deadline → op_schema (buiten venster)', () => {
    const c = { frequency: 30, interactions: [{ date: '2026-08-31', planned: false }] };
    assert.equal(computeBucket(c, REF), BUCKETS.OP_SCHEMA);
});

test('bucket: contact zonder frequency default naar 30', () => {
    const c = { interactions: [{ date: '2026-06-01', planned: false }] };
    // 15 sep - 1 jun = 106 dagen; freq default = 30; dtl = 76
    assert.equal(computeBucket(c, REF), BUCKETS.NU_AFSPRAAK_MAKEN);
    assert.equal(computeDagenTeLaat(c, REF), 76);
});

test('rightLabelClass: kleuring per bucket', () => {
    assert.equal(rightLabelClass(BUCKETS.NU_AFSPRAAK_MAKEN), 'late');
    assert.equal(rightLabelClass(BUCKETS.BINNEN_TWEE_WEKEN), 'soon');
    assert.equal(rightLabelClass(BUCKETS.AFSPRAAK_STAAT_AL), 'planned');
    assert.equal(rightLabelClass(BUCKETS.NOOIT_CONTACT), 'quiet');
    assert.equal(rightLabelClass(BUCKETS.OP_SCHEMA), 'quiet');
});

test('getRecentAttempt: poging binnen 14 dagen wordt gevonden', () => {
    const recent = getRecentAttempt([
        { kanaal: 'whatsapp', created_at: new Date(2026, 8, 11).toISOString() },
        { kanaal: 'bellen',   created_at: new Date(2026, 7, 1).toISOString() }
    ], REF);
    assert.equal(recent.kanaal, 'whatsapp');
});

test('getRecentAttempt: oudere pogingen (>14 dagen) worden genegeerd', () => {
    const oud = getRecentAttempt([
        { kanaal: 'mail', created_at: new Date(2026, 7, 20).toISOString() }
    ], REF);
    assert.equal(oud, null);
});

test('getRecentAttempt: bij meerdere binnen 14 dagen de meest recente', () => {
    const recent = getRecentAttempt([
        { kanaal: 'bellen',   created_at: new Date(2026, 8, 4).toISOString() },
        { kanaal: 'whatsapp', created_at: new Date(2026, 8, 10).toISOString() },
        { kanaal: 'mail',     created_at: new Date(2026, 8, 8).toISOString() }
    ], REF);
    assert.equal(recent.kanaal, 'whatsapp');
});

test('getRecentAttempt: null of lege array → null', () => {
    assert.equal(getRecentAttempt(null, REF), null);
    assert.equal(getRecentAttempt([], REF), null);
});

test('isPlannedForDate: vandaag telt als gepland (consistent met bucket-logica)', () => {
    assert.equal(isPlannedForDate('2026-09-15', REF), true);
});

test('isPlannedForDate: toekomst = gepland', () => {
    assert.equal(isPlannedForDate('2026-09-16', REF), true);
    assert.equal(isPlannedForDate('2027-01-01', REF), true);
});

test('isPlannedForDate: verleden = niet gepland (past interaction)', () => {
    assert.equal(isPlannedForDate('2026-09-14', REF), false);
    assert.equal(isPlannedForDate('2025-01-01', REF), false);
});

test('regressie: afspraak met planned=true en date=vandaag → AFSPRAAK_STAAT_AL, niet OP_SCHEMA', () => {
    const c = {
        frequency: 180,
        interactions: [{ date: '2026-09-15', planned: true }]
    };
    assert.equal(computeBucket(c, REF), BUCKETS.AFSPRAAK_STAAT_AL);
});
