const test = require('node:test');
const assert = require('node:assert/strict');
const { presetSpec, parseTimeString, formatTimeString, addMinutes, vindVrijeSlot, bouwAgendaItems } = require('../js/lib.js');

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

test('vindVrijeSlot: lege dag → passeert op startVensterVan', () => {
    const slot = vindVrijeSlot([], '11:30', '12:00', 90);
    assert.deepEqual(slot, { startTime: '11:30', endTime: '13:00' });
});

test('vindVrijeSlot: dag volledig bezet → null', () => {
    const events = [{ start: '00:00', end: '23:59' }];
    assert.equal(vindVrijeSlot(events, '11:30', '12:00', 90), null);
});

test('vindVrijeSlot: overlap aan begin blokkeert 11:30, 11:45 past wel', () => {
    // Event 11:00-11:45 overlapt met 11:30 start. 11:45 past (11:45-13:15, geen conflicten).
    const events = [{ start: '11:00', end: '11:45' }];
    const slot = vindVrijeSlot(events, '11:30', '12:00', 90);
    assert.deepEqual(slot, { startTime: '11:45', endTime: '13:15' });
});

test('vindVrijeSlot: overlap aan einde blokkeert alle 11:30-12:00 starts', () => {
    // Event 12:30-14:00: 11:30-13:00 zou overlappen, 11:45-13:15 idem, 12:00-13:30 idem.
    const events = [{ start: '12:30', end: '14:00' }];
    assert.equal(vindVrijeSlot(events, '11:30', '12:00', 90), null);
});

test('vindVrijeSlot: exact aansluitend event (11:30-12:00 event, start om 12:00) past', () => {
    // Start-venster is enkel 12:00 (van==tot). Event eindigt exact 12:00, dus 12:00-13:30 past.
    const events = [{ start: '11:30', end: '12:00' }];
    const slot = vindVrijeSlot(events, '12:00', '12:00', 90);
    assert.deepEqual(slot, { startTime: '12:00', endTime: '13:30' });
});

test('vindVrijeSlot: Anders-modus (van==tot) exact tijdstip vrij', () => {
    const slot = vindVrijeSlot([], '14:00', '14:00', 60);
    assert.deepEqual(slot, { startTime: '14:00', endTime: '15:00' });
});

test('vindVrijeSlot: Anders-modus tijdstip bezet → null', () => {
    const events = [{ start: '13:30', end: '14:30' }];
    assert.equal(vindVrijeSlot(events, '14:00', '14:00', 60), null);
});

test('vindVrijeSlot: kandidaten stepping van 15 min, eerste passende wint', () => {
    // Blokkeer 11:30-11:45 én 12:00-12:20. 11:45 past niet (overlap 12:00-12:20).
    // Volgende kandidaat 12:00 → 12:00-13:30 overlapt 12:00-12:20 → nope. Dus null.
    const events = [
        { start: '11:30', end: '11:45' },
        { start: '12:00', end: '12:20' }
    ];
    assert.equal(vindVrijeSlot(events, '11:30', '12:00', 90), null);
});

test('vindVrijeSlot: duur langer dan tot 23:59 → null (voorbij einde dag)', () => {
    assert.equal(vindVrijeSlot([], '22:00', '22:00', 180), null);
});

test('bouwAgendaItems: leeg + voorstel → 1 item (voorstel)', () => {
    const items = bouwAgendaItems([], { startTime: '12:00', endTime: '13:30' }, 'Lunch met Jamiroquai');
    assert.deepEqual(items, [
        { start: '12:00', end: '13:30', title: 'Lunch met Jamiroquai', isProposal: true }
    ]);
});

test('bouwAgendaItems: gesorteerd op start-tijd', () => {
    const events = [
        { start: '14:00', end: '15:00', title: 'Klantcall' },
        { start: '09:00', end: '10:00', title: 'Standup' }
    ];
    const items = bouwAgendaItems(events, { startTime: '12:00', endTime: '13:30' }, 'Lunch');
    assert.equal(items.length, 3);
    assert.equal(items[0].title, 'Standup');
    assert.equal(items[1].title, 'Lunch');
    assert.equal(items[1].isProposal, true);
    assert.equal(items[2].title, 'Klantcall');
});

test('bouwAgendaItems: events krijgen isProposal=false', () => {
    const events = [{ start: '09:00', end: '10:00', title: 'X' }];
    const items = bouwAgendaItems(events, { startTime: '11:00', endTime: '12:00' }, 'Y');
    assert.equal(items[0].isProposal, false);
});
