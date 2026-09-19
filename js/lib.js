/**
 * Contactbeheer — pure logica-laag.
 *
 * Dit bestand bevat alle functies die geen DOM of Supabase raken:
 * datum-helpers, bucket-logica, tekst-formatters, avatar-hulp, telefoon-
 * normalisatie en de urgentie-sortering. Ze zijn afzonderlijk testbaar
 * onder Node (via `node --test`) en tegelijk beschikbaar als globals
 * voor de browser via `window`. app.js gaat ervan uit dat lib.js
 * VÓÓR app.js in de HTML wordt geladen.
 */

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        Object.assign(root, api);
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {

    // --- Constants ------------------------------------------------------

    const BUCKETS = {
        AFSPRAAK_STAAT_AL: 'afspraak_staat_al',
        NOOIT_CONTACT: 'nooit_contact',
        NU_AFSPRAAK_MAKEN: 'nu_afspraak_maken',
        BINNEN_TWEE_WEKEN: 'binnen_twee_weken',
        OP_SCHEMA: 'op_schema'
    };

    const BUCKET_COLORS = {
        [BUCKETS.NU_AFSPRAAK_MAKEN]: '#B23B32',
        [BUCKETS.BINNEN_TWEE_WEKEN]: '#96661A',
        [BUCKETS.AFSPRAAK_STAAT_AL]: '#2F5F8A',
        [BUCKETS.NOOIT_CONTACT]: '#8A93A0',
        geprobeerd: '#8A93A0'
    };

    const BUCKET_TITLES = {
        [BUCKETS.NU_AFSPRAAK_MAKEN]: 'Nu een afspraak maken',
        [BUCKETS.BINNEN_TWEE_WEKEN]: 'Binnen twee weken',
        [BUCKETS.AFSPRAAK_STAAT_AL]: 'Afspraak staat al',
        [BUCKETS.NOOIT_CONTACT]: 'Nooit contact gehad',
        geprobeerd: 'Geprobeerd, nog geen reactie'
    };

    const NL_MONTHS = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const NL_WEEKDAYS_SHORT = ['zo','ma','di','wo','do','vr','za'];

    const PHONE_KEY_PATTERNS = [/mobiel/i, /telefoon/i, /^tel$/i, /phone/i, /mobile/i, /nummer/i, /gsm/i];
    const EMAIL_KEY_PATTERNS = [/e-?mail/i, /^mail$/i];

    const ATTEMPT_VERBS = { bellen: 'Gebeld', whatsapp: 'Geappt', mail: 'Gemaild' };

    const AVATAR_FALLBACK_COLOR = '#8A93A0';

    // --- Date helpers ---------------------------------------------------

    function parseLocalDate(dateString) {
        const parts = String(dateString).split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function startOfDay(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function daysBetween(a, b) {
        return Math.round((a - b) / (1000 * 60 * 60 * 24));
    }

    function dagWoord(n) {
        return n === 1 ? 'dag' : 'dagen';
    }

    function parseTimeString(hhmm) {
        const [h, m] = String(hhmm).split(':').map(Number);
        return h * 60 + m;
    }

    function formatTimeString(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function addMinutes(hhmm, minutes) {
        return formatTimeString(parseTimeString(hhmm) + minutes);
    }

    // --- Interaction helpers -------------------------------------------

    function getPastInteractions(contact, today) {
        if (!contact.interactions) return [];
        return contact.interactions.filter(i => parseLocalDate(i.date) <= today);
    }

    // Een afspraak wordt als "gepland" opgeslagen als de datum vandaag of
    // in de toekomst valt (consistent met hasFuturePlannedInteraction).
    // Gebruikt door saveInteraction; hier zodat het testbaar is.
    function isPlannedForDate(dateString, referenceDate) {
        const selected = parseLocalDate(dateString);
        const today = startOfDay(referenceDate || new Date());
        return selected >= today;
    }

    function hasFuturePlannedInteraction(contact, today) {
        if (!contact.interactions) return false;
        return contact.interactions.some(i => {
            if (!i.planned) return false;
            return parseLocalDate(i.date) >= today;
        });
    }

    function daysSinceLastPastInteraction(contact, today) {
        const past = getPastInteractions(contact, today);
        if (past.length === 0) return null;
        const dates = past.map(i => parseLocalDate(i.date));
        const most = new Date(Math.max.apply(null, dates));
        return daysBetween(today, most);
    }

    function getLastPastInteractionDate(contact, today) {
        const past = getPastInteractions(contact, today);
        if (past.length === 0) return null;
        const dates = past.map(i => parseLocalDate(i.date));
        return new Date(Math.max.apply(null, dates));
    }

    // --- Bucket-logica --------------------------------------------------

    function computeDagenTeLaat(contact, referenceDate) {
        const today = startOfDay(referenceDate || new Date());
        const daysSince = daysSinceLastPastInteraction(contact, today);
        if (daysSince === null) return null;
        const frequency = contact.frequency || 30;
        return daysSince - frequency;
    }

    function computeBucket(contact, referenceDate) {
        const today = startOfDay(referenceDate || new Date());
        if (hasFuturePlannedInteraction(contact, today)) return BUCKETS.AFSPRAAK_STAAT_AL;
        const daysSince = daysSinceLastPastInteraction(contact, today);
        if (daysSince === null) return BUCKETS.NOOIT_CONTACT;
        const frequency = contact.frequency || 30;
        if (daysSince >= frequency) return BUCKETS.NU_AFSPRAAK_MAKEN;
        const daysUntilDue = frequency - daysSince;
        if (daysUntilDue >= 0 && daysUntilDue <= 14) return BUCKETS.BINNEN_TWEE_WEKEN;
        return BUCKETS.OP_SCHEMA;
    }

    function rightLabelClass(bucketKey) {
        if (bucketKey === BUCKETS.NU_AFSPRAAK_MAKEN) return 'late';
        if (bucketKey === BUCKETS.BINNEN_TWEE_WEKEN) return 'soon';
        if (bucketKey === BUCKETS.AFSPRAAK_STAAT_AL) return 'planned';
        return 'quiet';
    }

    // --- Attempts -------------------------------------------------------

    function getRecentAttempt(attempts, referenceDate) {
        if (!attempts || attempts.length === 0) return null;
        const now = referenceDate || new Date();
        const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const recent = attempts
            .filter(a => new Date(a.created_at) >= cutoff)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return recent.length > 0 ? recent[0] : null;
    }

    // --- Tekst-formatters ----------------------------------------------

    function formatUrgencyLabel(dagenTeLaat) {
        if (dagenTeLaat === null || dagenTeLaat === undefined) return 'nog geen contact';
        if (dagenTeLaat > 0) return `${dagenTeLaat} ${dagWoord(dagenTeLaat)} te laat`;
        if (dagenTeLaat === 0) return 'vandaag';
        const n = -dagenTeLaat;
        return `over ${n} ${dagWoord(n)}`;
    }

    function formatAttemptLabel(attempt, referenceDate) {
        if (!attempt) return null;
        const now = referenceDate || new Date();
        const created = new Date(attempt.created_at);
        const daysAgo = daysBetween(startOfDay(now), startOfDay(created));
        const verb = ATTEMPT_VERBS[attempt.kanaal] || attempt.kanaal;
        if (daysAgo <= 0) return `${verb}, vandaag`;
        return `${verb}, ${daysAgo} ${dagWoord(daysAgo)} geleden`;
    }

    function formatPlannedDateShort(dateString, referenceDate) {
        const d = parseLocalDate(dateString);
        const today = startOfDay(referenceDate || new Date());
        const days = daysBetween(d, today);
        if (days === 0) return 'vandaag';
        if (days === 1) return 'morgen';
        if (days > 1 && days <= 7) return NL_WEEKDAYS_SHORT[d.getDay()];
        return `${d.getDate()} ${NL_MONTHS[d.getMonth()]}`;
    }

    // --- Slot-zoeker ---------------------------------------------------

    function presetSpec(preset, andersInput) {
        if (preset === 'lunch') {
            return { startVensterVan: '11:30', startVensterTot: '12:00', duur: 90, titelTemplate: 'Lunch met {naam}' };
        }
        if (preset === 'diner') {
            return { startVensterVan: '18:00', startVensterTot: '19:30', duur: 180, titelTemplate: 'Diner met {naam}' };
        }
        if (preset === 'anders') {
            const t = (andersInput && andersInput.starttijd) || '14:00';
            const d = (andersInput && andersInput.duur) || 60;
            return { startVensterVan: t, startVensterTot: t, duur: d, titelTemplate: null };
        }
        return null;
    }

    // Zoek de eerste starttijd binnen [startVensterVan, startVensterTot]
    // (stepping 15 min) waar het blok [start, start+duur) geen enkel event
    // overlapt. Voor "Anders"-modus (van==tot) wordt alleen die exacte
    // starttijd geprobeerd. Retourneert {startTime, endTime} of null.
    function vindVrijeSlot(events, startVensterVan, startVensterTot, duur, stapMinuten) {
        const stap = stapMinuten || 15;
        const eindeVanDag = 24 * 60 - 1;
        const vanMin = parseTimeString(startVensterVan);
        const totMin = parseTimeString(startVensterTot);
        const eventRanges = (events || []).map(e => ({
            start: parseTimeString(e.start),
            end: parseTimeString(e.end)
        }));

        // Voor Anders: van==tot, dus één iteratie.
        for (let kand = vanMin; kand <= totMin; kand += stap) {
            const einde = kand + duur;
            if (einde > eindeVanDag) continue;
            const overlaps = eventRanges.some(ev => kand < ev.end && einde > ev.start);
            if (!overlaps) {
                return { startTime: formatTimeString(kand), endTime: formatTimeString(einde) };
            }
            if (vanMin === totMin) break; // geen stepping in Anders-modus
        }
        return null;
    }

    // Combineer bestaande events met het voorstel-slot en sorteer op
    // start-tijd. Events krijgen isProposal=false, het voorstel true.
    // Nodig voor de agenda-mini-view in Stap 4 van de slot-zoeker.
    function bouwAgendaItems(events, slot, proposalTitle) {
        const items = (events || []).map(e => ({
            start: e.start,
            end: e.end,
            title: e.title,
            isProposal: false
        }));
        items.push({
            start: slot.startTime,
            end: slot.endTime,
            title: proposalTitle,
            isProposal: true
        });
        items.sort((a, b) => parseTimeString(a.start) - parseTimeString(b.start));
        return items;
    }

    // --- Contact info helpers ------------------------------------------

    function findCustomFieldValue(contact, patterns) {
        if (!contact.customFields) return null;
        for (const field of contact.customFields) {
            if (!field.key || !field.value) continue;
            if (patterns.some(p => p.test(field.key))) return field.value.trim();
        }
        return null;
    }

    function getContactPhone(contact) {
        if (contact.phone && contact.phone.trim()) return contact.phone.trim();
        return findCustomFieldValue(contact, PHONE_KEY_PATTERNS);
    }

    function getContactEmail(contact) {
        if (contact.email && contact.email.trim()) return contact.email.trim();
        return findCustomFieldValue(contact, EMAIL_KEY_PATTERNS);
    }

    // Voor wa.me: internationaal, alleen cijfers. NL-lokaal (start met 0)
    // krijgt landcode 31. `00` internationaal prefix wordt verwijderd.
    function normalizePhoneForWa(raw) {
        if (!raw) return null;
        let digits = raw.replace(/\D/g, '');
        if (!digits) return null;
        if (digits.startsWith('00')) digits = digits.slice(2);
        else if (digits.startsWith('0')) digits = '31' + digits.slice(1);
        return digits;
    }

    // --- Avatar ---------------------------------------------------------

    function getContactInitials(contact) {
        if (!contact || !contact.name) return '·';
        const words = contact.name.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return '·';
        if (words.length === 1) {
            const w = words[0];
            return (w.length >= 2 ? w.slice(0, 2) : w).toUpperCase();
        }
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }

    // --- Sort -----------------------------------------------------------

    // Rank voor "sorteren op urgentie": hoger = urgenter. `null` (nooit
    // contact gehad) valt naar beneden zodat te-late contacten bovenaan
    // staan.
    function urgencyRank(contact, referenceDate) {
        const dtl = computeDagenTeLaat(contact, referenceDate);
        if (dtl === null) return -Infinity;
        return dtl;
    }

    return {
        // constants
        BUCKETS, BUCKET_COLORS, BUCKET_TITLES,
        NL_MONTHS, NL_WEEKDAYS_SHORT,
        PHONE_KEY_PATTERNS, EMAIL_KEY_PATTERNS,
        ATTEMPT_VERBS,
        AVATAR_FALLBACK_COLOR,
        // date helpers
        parseLocalDate, startOfDay, daysBetween, dagWoord,
        parseTimeString, formatTimeString, addMinutes,
        // interaction helpers
        getPastInteractions, hasFuturePlannedInteraction,
        daysSinceLastPastInteraction, getLastPastInteractionDate,
        isPlannedForDate,
        // bucket
        computeDagenTeLaat, computeBucket, rightLabelClass,
        // attempts
        getRecentAttempt,
        // formatters
        formatUrgencyLabel, formatAttemptLabel, formatPlannedDateShort,
        // contact info
        findCustomFieldValue, getContactPhone, getContactEmail,
        normalizePhoneForWa,
        // avatar
        getContactInitials,
        // sort
        urgencyRank,
        // slot-zoeker
        presetSpec,
        vindVrijeSlot,
        bouwAgendaItems
    };
}));
