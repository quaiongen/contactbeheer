const test = require('node:test');
const assert = require('node:assert/strict');
const { getContactInitials } = require('../js/lib.js');

test('initials: één woord van 2+ letters → eerste 2 uppercase', () => {
    assert.equal(getContactInitials({ name: 'Jamiroquai' }), 'JA');
    assert.equal(getContactInitials({ name: 'snobisme' }), 'SN');
});

test('initials: één woord van 1 letter → die letter uppercase', () => {
    assert.equal(getContactInitials({ name: 'a' }), 'A');
});

test('initials: twee woorden → eerste letter van elk uppercase', () => {
    assert.equal(getContactInitials({ name: 'Bart Lutmers' }), 'BL');
    assert.equal(getContactInitials({ name: 'li ying' }), 'LY');
});

test('initials: drie+ woorden → eerste + laatste', () => {
    assert.equal(getContactInitials({ name: 'Anne van der Meer' }), 'AM');
    assert.equal(getContactInitials({ name: 'Bart-Jan Lutmerding' }), 'BL');
});

test('initials: extra spaties tussen woorden → correct genegeerd', () => {
    assert.equal(getContactInitials({ name: '  Kris    Jansen  ' }), 'KJ');
});

test('initials: geen naam of leeg → · als fallback', () => {
    assert.equal(getContactInitials({}), '·');
    assert.equal(getContactInitials({ name: '' }), '·');
    assert.equal(getContactInitials({ name: '   ' }), '·');
    assert.equal(getContactInitials(null), '·');
});
