const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizePhoneForWa,
    getContactPhone,
    getContactEmail
} = require('../js/lib.js');

test('normalizePhoneForWa: null of leeg → null', () => {
    assert.equal(normalizePhoneForWa(null), null);
    assert.equal(normalizePhoneForWa(undefined), null);
    assert.equal(normalizePhoneForWa(''), null);
    assert.equal(normalizePhoneForWa('   '), null);
    assert.equal(normalizePhoneForWa('abc'), null);
});

test('normalizePhoneForWa: NL-lokaal met 0 → 31 landcode', () => {
    assert.equal(normalizePhoneForWa('0612345678'), '31612345678');
    assert.equal(normalizePhoneForWa('06-12345678'), '31612345678');
    assert.equal(normalizePhoneForWa('06 12 34 56 78'), '31612345678');
});

test('normalizePhoneForWa: internationaal met + → cijfers overhouden', () => {
    assert.equal(normalizePhoneForWa('+31612345678'), '31612345678');
    assert.equal(normalizePhoneForWa('+31 6 12 34 56 78'), '31612345678');
});

test('normalizePhoneForWa: 00 prefix wordt gestript', () => {
    assert.equal(normalizePhoneForWa('0031612345678'), '31612345678');
});

test('getContactPhone: vast veld heeft voorrang op custom fields', () => {
    const c = {
        phone: '0611111111',
        customFields: [{ key: 'Telefoon', value: '0699999999' }]
    };
    assert.equal(getContactPhone(c), '0611111111');
});

test('getContactPhone: fallback naar customField met bekende sleutel', () => {
    assert.equal(getContactPhone({
        customFields: [{ key: 'Telefoon', value: '0611111111' }]
    }), '0611111111');
    assert.equal(getContactPhone({
        customFields: [{ key: 'Mobiel', value: '0622222222' }]
    }), '0622222222');
    assert.equal(getContactPhone({
        customFields: [{ key: 'GSM', value: '0633333333' }]
    }), '0633333333');
});

test('getContactPhone: whitespace wordt getrimd', () => {
    assert.equal(getContactPhone({ phone: '  0612345678  ' }), '0612345678');
});

test('getContactPhone: geen match in customFields → null', () => {
    assert.equal(getContactPhone({
        customFields: [{ key: 'Notitie', value: 'iets' }]
    }), null);
    assert.equal(getContactPhone({}), null);
});

test('getContactEmail: vast veld heeft voorrang', () => {
    const c = {
        email: 'primary@x.nl',
        customFields: [{ key: 'E-mail', value: 'other@x.nl' }]
    };
    assert.equal(getContactEmail(c), 'primary@x.nl');
});

test('getContactEmail: fallback naar customField met bekende sleutel', () => {
    assert.equal(getContactEmail({
        customFields: [{ key: 'E-mail', value: 'foo@x.nl' }]
    }), 'foo@x.nl');
    assert.equal(getContactEmail({
        customFields: [{ key: 'Email', value: 'bar@x.nl' }]
    }), 'bar@x.nl');
});
