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
        // All-day events blokkeren geen slots (informatie-only), dus filter ze uit.
        // View-only events (isBlocking=false) blokkeren ook geen slots.
        // Undefined isBlocking telt als blocking (backwards-compat met bestaande tests).
        const eventRanges = (events || [])
            .filter(e => !e.allDay && e.isBlocking !== false && e.start && e.end)
            .map(e => ({
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
    // All-day events komen bovenaan (in binnengekomen volgorde), timed
    // events daarna chronologisch gesorteerd — inclusief het voorstel.
    // Nodig voor de agenda-mini-view in Stap 4 van de slot-zoeker.
    function bouwAgendaItems(events, slot, proposalTitle) {
        const allDay = (events || [])
            .filter(e => e.allDay)
            .map(e => ({ allDay: true, title: e.title, isProposal: false }));
        const timed = (events || [])
            .filter(e => !e.allDay && e.start && e.end)
            .map(e => {
                const isView = !!e.isViewOnly;
                return {
                    start: e.start,
                    end: e.end,
                    title: isView && e.calendarSummary ? `${e.calendarSummary}: ${e.title}` : e.title,
                    isProposal: false,
                    isViewOnly: isView
                };
            });
        timed.push({
            start: slot.startTime,
            end: slot.endTime,
            title: proposalTitle,
            isProposal: true
        });
        timed.sort((a, b) => parseTimeString(a.start) - parseTimeString(b.start));
        return allDay.concat(timed);
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

    // --- Weekmail-abonnement -------------------------------------------

    // Dagnummering volgt `Date.getDay()` en PostgreSQL's `EXTRACT(DOW)`:
    // 0 = zondag … 6 = zaterdag. Die twee zijn gelijk, dus er is één
    // nummering over de hele stack.
    const DIGEST_DAG_NAMEN = [
        'zondag', 'maandag', 'dinsdag', 'woensdag',
        'donderdag', 'vrijdag', 'zaterdag'
    ];

    // Strikt parsen naar een dagnummer. `Number()` alleen is niet genoeg:
    // Number(false), Number([]) en Number(' ') zijn alle drie 0, wat een
    // corrupte waarde stil in een zondagmail zou veranderen. Daarom eerst
    // een type-check, en strings alleen als ze uit louter cijfers bestaan
    // (de database levert smallint soms als string terug).
    function parseDagNummer(v) {
        if (typeof v === 'number') return Number.isInteger(v) ? v : null;
        if (typeof v === 'string') {
            const t = v.trim();
            return /^\d+$/.test(t) ? parseInt(t, 10) : null;
        }
        return null;
    }

    // Geeft `null` bij alles wat geen geheel getal 0-6 is, zodat een
    // corrupte waarde zichtbaar wordt in plaats van stil 'zondag' te tonen.
    function digestDagNaam(dag) {
        const n = parseDagNummer(dag);
        if (n === null || n < 0 || n > 6) return null;
        return DIGEST_DAG_NAMEN[n];
    }

    // Moet deze gebruiker vandaag de weekmail krijgen?
    //
    // `settings` is de rij uit `user_settings`, of null/undefined als de
    // gebruiker er geen heeft. Geen rij = niet geabonneerd: dat is de kern
    // van de opt-in, dus de default is altijd "niet mailen".
    //
    // `digest_enabled` moet exact `true` zijn. Een truthy niet-boolean
    // (bijvoorbeeld de string 'false') telt niet mee — een mail per ongeluk
    // versturen is erger dan er een missen.
    //
    // Deze regel staat ook in `supabase/functions/weekly-digest/index.ts`.
    // Bewuste duplicatie, zelfde afspraak als de bucket-logica: de Edge
    // Function is een eigen deploy-eenheid en kan lib.js niet importeren.
    function moetDigestVandaag(settings, vandaagDow) {
        if (!settings || settings.digest_enabled !== true) return false;
        const vandaag = parseDagNummer(vandaagDow);
        if (vandaag === null || vandaag < 0 || vandaag > 6) return false;
        // Ontbrekende dag valt terug op maandag, gelijk aan de kolom-default.
        const dag = settings.digest_dag === undefined || settings.digest_dag === null
            ? 1
            : parseDagNummer(settings.digest_dag);
        if (dag === null || dag < 0 || dag > 6) return false;
        return dag === vandaag;
    }

    // --- vCard-import -----------------------------------------------------

    // Decodeer vCard TEXT-escapes. Volgorde: eerst splitsen op `\\` zodat een
    // letterlijke backslash-n (`\\n`) niet als newline wordt gelezen.
    function unescapeVCardText(s) {
        return String(s).split('\\\\').map(part =>
            part.replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';')
        ).join('\\');
    }

    const VCARD_SINGLE_FIELDS = ['FN', 'N', 'BDAY', 'NOTE', 'ORG', 'PHOTO', 'ADR', 'TITLE', 'URL', 'NICKNAME', 'REV'];

    /**
     * Parse een .vcf-tekst (één of meer vCards) naar ruwe objecten.
     * TEL/EMAIL zijn arrays van {value, params:{type?: string[]}}.
     * FN/NOTE/ORG zijn gedecodeerd; N en BDAY blijven raw (mapper beslist).
     */
    function parseVCard(text) {
        if (typeof text !== 'string') return [];
        const lines = text
            .replace(/^﻿/, '')
            .replace(/\r\n|\r/g, '\n')
            .replace(/\n[ \t]/g, '')      // unfold: dekt \r\n␠, \r\n\t, \n␠, \n\t
            .split('\n');
        const cards = [];
        let cur = null;
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            const upper = line.toUpperCase();
            if (upper === 'BEGIN:VCARD') { cur = { TEL: [], EMAIL: [] }; continue; }
            if (upper === 'END:VCARD') { if (cur) cards.push(cur); cur = null; continue; }
            if (!cur) continue;
            const colon = line.indexOf(':');
            if (colon < 0) continue;
            const head = line.slice(0, colon).split(';');
            let value = line.slice(colon + 1);
            const name = head[0].split('.').pop().toUpperCase(); // groep-prefix "item1." weg
            const types = [];
            for (const p of head.slice(1)) {
                const eq = p.indexOf('=');
                const key = (eq < 0 ? 'type' : p.slice(0, eq)).toLowerCase();
                const val = eq < 0 ? p : p.slice(eq + 1);
                if (key === 'type') val.split(',').map(t => t.trim()).filter(Boolean).forEach(t => types.push(t));
            }
            const params = types.length ? { type: types } : {};
            if (name === 'TEL' || name === 'EMAIL') {
                if (name === 'TEL') value = value.replace(/^tel:/i, '');
                cur[name].push({ value: value.trim(), params });
            } else if (VCARD_SINGLE_FIELDS.includes(name) && cur[name] === undefined) {
                if (name === 'FN' || name === 'NOTE') value = unescapeVCardText(value);
                else if (name === 'ORG') value = unescapeVCardText(value.split(/(?<!\\);/)[0]);
                cur[name] = value.trim();
            }
        }
        return cards;
    }

    function pickTyped(list, wanted) {
        if (!list || !list.length) return null;
        const hit = list.find(e => (e.params.type || []).some(t => wanted.includes(t.toLowerCase())));
        return hit || list[0];
    }

    function normalizeVCardBirthday(raw) {
        if (!raw) return null;
        const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/.exec(String(raw).trim());
        if (!m) return null; // incl. "--MMDD" (jaar onbekend) en onzin
        const [, y, mo, d] = m;
        const dt = new Date(Date.UTC(+y, +mo - 1, +d));
        if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
        return `${y}-${mo}-${d}`;
    }

    /** vCard-object (uit parseVCard) → concept-contact, of null bij lege naam. */
    function mapVCardToContact(vcard) {
        let name = (vcard.FN || '').trim();
        if (!name && vcard.N) {
            const [last = '', first = ''] = vcard.N.split(';').map(p => unescapeVCardText(p).trim());
            name = [first, last].filter(Boolean).join(' ');
        }
        if (!name) return null;
        const tel = pickTyped(vcard.TEL, ['cell', 'mobiel']);
        const mail = pickTyped(vcard.EMAIL, ['home']);
        const org = (vcard.ORG || '').trim();
        return {
            name,
            phone: tel ? tel.value.replace(/^tel:/i, '').replace(/[\s\-()]/g, '') : '',
            email: mail ? mail.value.trim().toLowerCase() : '',
            birthday: normalizeVCardBirthday(vcard.BDAY),
            notes: vcard.NOTE || '',
            customFields: org ? [{ key: 'Bedrijf', value: org }] : []
        };
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
        bouwAgendaItems,
        // weekmail-abonnement
        DIGEST_DAG_NAMEN,
        digestDagNaam,
        moetDigestVandaag,
        // vCard-import
        unescapeVCardText,
        parseVCard,
        mapVCardToContact
    };
}));
