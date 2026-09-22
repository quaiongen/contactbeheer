const test = require('node:test');
const assert = require('node:assert/strict');
const {
    digestDagNaam,
    moetDigestVandaag
} = require('../js/lib.js');

// --- digestDagNaam ------------------------------------------------------

test('digestDagNaam: 0-6 → Nederlandse dagnamen, zondag-start zoals getDay()', () => {
    assert.equal(digestDagNaam(0), 'zondag');
    assert.equal(digestDagNaam(1), 'maandag');
    assert.equal(digestDagNaam(2), 'dinsdag');
    assert.equal(digestDagNaam(3), 'woensdag');
    assert.equal(digestDagNaam(4), 'donderdag');
    assert.equal(digestDagNaam(5), 'vrijdag');
    assert.equal(digestDagNaam(6), 'zaterdag');
});

test('digestDagNaam: numerieke string wordt geaccepteerd', () => {
    assert.equal(digestDagNaam('1'), 'maandag');
    assert.equal(digestDagNaam('6'), 'zaterdag');
});

test('digestDagNaam: buiten bereik of onzin → null', () => {
    assert.equal(digestDagNaam(-1), null);
    assert.equal(digestDagNaam(7), null);
    assert.equal(digestDagNaam(null), null);
    assert.equal(digestDagNaam(undefined), null);
    assert.equal(digestDagNaam('maandag'), null);
    assert.equal(digestDagNaam(1.5), null);
});

// --- moetDigestVandaag -------------------------------------------------

test('moetDigestVandaag: aan én dag matcht → true', () => {
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: 1 }, 1), true);
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: 0 }, 0), true);
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: 6 }, 6), true);
});

test('moetDigestVandaag: aan maar andere dag → false', () => {
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: 1 }, 2), false);
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: 6 }, 0), false);
});

test('moetDigestVandaag: uit → false, ook op de gekozen dag', () => {
    assert.equal(moetDigestVandaag({ digest_enabled: false, digest_dag: 1 }, 1), false);
});

// Dit is de kern van de opt-in: geen rij in user_settings betekent niet
// abonneren. Een nieuwe gebruiker heeft geen rij en mag dus geen mail krijgen.
test('moetDigestVandaag: geen settings-rij → false', () => {
    assert.equal(moetDigestVandaag(null, 1), false);
    assert.equal(moetDigestVandaag(undefined, 1), false);
    assert.equal(moetDigestVandaag({}, 1), false);
});

test('moetDigestVandaag: ontbrekende digest_dag → valt terug op maandag', () => {
    assert.equal(moetDigestVandaag({ digest_enabled: true }, 1), true);
    assert.equal(moetDigestVandaag({ digest_enabled: true }, 2), false);
});

test('moetDigestVandaag: string-waarden uit de database werken', () => {
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: '3' }, 3), true);
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: '3' }, 4), false);
});

// Alleen een echte boolean true zet het abonnement aan. Een truthy string
// als 'false' uit een verkeerd geparste bron mag niet per ongeluk mailen.
test('moetDigestVandaag: truthy niet-boolean voor digest_enabled → false', () => {
    assert.equal(moetDigestVandaag({ digest_enabled: 'false', digest_dag: 1 }, 1), false);
    assert.equal(moetDigestVandaag({ digest_enabled: 1, digest_dag: 1 }, 1), false);
});

test('moetDigestVandaag: ongeldige vandaag-dow → false', () => {
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: 1 }, 7), false);
    assert.equal(moetDigestVandaag({ digest_enabled: true, digest_dag: 1 }, null), false);
});
