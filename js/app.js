/**
 * Contact Timer Application
 * A web application for managing contacts and tracking interaction frequency
 */

// Data structure for the application
let contactsData = [];
let categoriesData = [];

// DOM Elements
const contactsContainer = document.getElementById('contacts-container');
const noContactsMessage = document.getElementById('no-contacts-message');
const addContactBtn = document.getElementById('add-contact-btn');
const saveContactBtn = document.getElementById('save-contact-btn');
const contactForm = document.getElementById('contact-form');
const customFieldsContainer = document.getElementById('custom-fields-container');
const addFieldBtn = document.getElementById('add-field-btn');
const saveInteractionBtn = document.getElementById('save-interaction-btn');
const deleteInteractionBtn = document.getElementById('delete-interaction-btn');
// details-modal delete/edit-knoppen zitten nu inline in de dynamisch
// opgebouwde details-body; geen top-level refs meer nodig.
const exportDataBtn = document.getElementById('export-data-btn');
const importDataBtn = document.getElementById('import-data-btn');
const importFileInput = document.getElementById('import-file-input');
const manageCategoriesBtn = document.getElementById('manage-categories-btn');
const categoryForm = document.getElementById('category-form');
const categoriesList = document.getElementById('categories-list');
const contactCategorySelect = document.getElementById('contact-category');
const searchContactsInput = document.getElementById('search-contacts');
const categoryFilters = document.getElementById('category-filters');

// Bootstrap Modal instances
let contactModal;
let interactionModal;
let detailsModal;
let authModal;
let categoriesModal;
let editCategoryModal;

// Current user
let currentUser = null;

// Current sort method
let currentSortMethod = 'urgency';

// Search & filter state
let currentSearchQuery = '';
let currentCategoryFilter = 'all';

// Google Calendar
const GOOGLE_CLIENT_ID = '427383300995-560ndb1vs21i1a8idhm4cm2m1u0h495v.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const GOOGLE_CONSENT_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000; // 60 dagen
let googleTokenClient = null;
let googleAccessToken = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap modals
    contactModal = new bootstrap.Modal(document.getElementById('contact-modal'));
    interactionModal = new bootstrap.Modal(document.getElementById('interaction-modal'));
    detailsModal = new bootstrap.Modal(document.getElementById('details-modal'));
    categoriesModal = new bootstrap.Modal(document.getElementById('categories-modal'));
    editCategoryModal = new bootstrap.Modal(document.getElementById('edit-category-modal'));

    // Edit category color picker
    document.getElementById('edit-color-grid').querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', function() {
            const color = this.dataset.color;
            document.getElementById('edit-category-color').value = color;
            document.getElementById('edit-selected-color-preview').style.backgroundColor = color;
            document.getElementById('edit-category-preview').style.backgroundColor = color;
            document.getElementById('edit-color-grid').querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            // Sluit dropdown
            const dd = bootstrap.Dropdown.getInstance(document.getElementById('edit-color-dropdown'));
            if (dd) dd.hide();
        });
    });

    // Edit category naam live preview
    document.getElementById('edit-category-name').addEventListener('input', function() {
        document.getElementById('edit-category-preview').textContent = this.value || 'Voorbeeld';
    });

    // Save edit category
    document.getElementById('save-edit-category-btn').addEventListener('click', function() {
        updateCategory();
    });

    // Load data from localStorage
    loadContactsData();
    loadCategoriesData();
    
    // Render contacts
    renderContacts();

    // Populeer categorie filter chips (for non-Supabase environments)
    // For Supabase, this is called in loadDataFromSupabase()
    if (!isSupabaseConfigured() || !currentUser) {
        populateCategoryFilters();
    }

    // Search & filter event listeners
    if (searchContactsInput) {
        searchContactsInput.addEventListener('input', function() {
            currentSearchQuery = this.value.toLowerCase();
            renderContacts();
        });
    }

    // Category filter buttons
    document.addEventListener('click', function(e) {
        if (e.target.closest('#category-filters .btn')) {
            const btn = e.target.closest('#category-filters .btn');
            const category = btn.dataset.category;

            // Update active button
            categoryFilters.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update filter & render
            currentCategoryFilter = category;
            renderContacts();
        }
    });

    // Instellingen button
    document.getElementById('user-settings-btn').addEventListener('click', () => {
        openUserSettingsModal();
    });

    // Google Calendar button
    document.getElementById('google-calendar-btn').addEventListener('click', () => {
        // Niet verbonden → start OAuth direct (bewaar 1-click UX voor nieuwe users).
        // Verbonden → open Kalender-beheer modal.
        if (!googleAccessToken) {
            connectGoogleCalendar();
        } else {
            openCalendarSettingsModal();
        }
    });

    // Bestaande verbinding? Markeer dat deze browser ooit gekoppeld is
    // geweest, ook voor gebruikers van vóór deze feature.
    if (localStorage.getItem('google_consent_granted')) {
        localStorage.setItem('google_calendar_ever_connected', 'true');
    }

    // Stille token-vernieuwing wordt pas gestart NA Contactbeheer-login
    // (in onAuthStateChange). Op page-load starten kan een Google-popup
    // triggeren vóór de user Contactbeheer-login ziet.

    // Reconnect-prompt (getoond bij nieuwe afspraak zonder actieve verbinding)
    const reconnectBtn = document.getElementById('calendar-reconnect-btn');
    const skipBtn = document.getElementById('calendar-skip-btn');
    if (reconnectBtn) reconnectBtn.addEventListener('click', handleCalendarReconnectClick);
    if (skipBtn) skipBtn.addEventListener('click', handleCalendarSkipClick);

    // Date change in interaction modal → check availability
    document.getElementById('interaction-date').addEventListener('change', function() {
        if (googleAccessToken && this.value) {
            checkGoogleAvailability(this.value);
        }
    });

    // Start time change → auto-set end time to start + 1 uur
    document.getElementById('interaction-start-time').addEventListener('change', function() {
        if (this.value) {
            const [h, m] = this.value.split(':').map(Number);
            const newH = (h + 1) % 24;
            document.getElementById('interaction-end-time').value =
                `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
    });

    // Set up event listeners
    setupEventListeners();

    // Initialize notification system
    initNotifications();

    // Check for contacts that need interaction
    checkContactsDue();
});

/**
 * Load contacts data from localStorage
 */
function loadContactsData() {
    const savedData = localStorage.getItem('contactsData');
    if (savedData) {
        contactsData = JSON.parse(savedData);
    }
}

/**
 * Load categories data from localStorage
 */
function loadCategoriesData() {
    const savedData = localStorage.getItem('categoriesData');
    if (savedData) {
        categoriesData = JSON.parse(savedData);
    }
}

/**
 * Save contacts data to localStorage (legacy - only used as backup)
 */
function saveContactsData() {
    // Only save to localStorage if Supabase is not configured
    if (!isSupabaseConfigured() || !currentUser) {
        localStorage.setItem('contactsData', JSON.stringify(contactsData));
    }
}

/**
 * Save categories data to localStorage
 */
function saveCategoriesData() {
    if (!isSupabaseConfigured() || !currentUser) {
        localStorage.setItem('categoriesData', JSON.stringify(categoriesData));
    }
}

/**
 * Set up event listeners for user interactions
 */
function setupEventListeners() {
    // Add new contact button
    addContactBtn.addEventListener('click', function() {
        resetContactForm();
        populateCategorySelect();
        document.getElementById('modal-title').textContent = 'Contact Toevoegen';
        contactModal.show();
    });

    // Manage categories button
    if (manageCategoriesBtn) {
        manageCategoriesBtn.addEventListener('click', function() {
            renderCategoriesList();
            categoriesModal.show();
        });
    }

    // Category form submit
    if (categoryForm) {
        categoryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveCategory();
        });
    }

    // Color picker interaction
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove selected class from all
            colorOptions.forEach(opt => opt.classList.remove('selected'));
            // Add to clicked
            this.classList.add('selected');
            // Update hidden input and preview
            const color = this.getAttribute('data-color');
            document.getElementById('category-color').value = color;
            document.getElementById('selected-color-preview').style.backgroundColor = color;
            // Close dropdown (optional, maybe keep open)
        });
    });
    
    // Save contact button
    saveContactBtn.addEventListener('click', saveContact);
    
    // Add field button
    addFieldBtn.addEventListener('click', addCustomField);
    
    // Save interaction button
    saveInteractionBtn.addEventListener('click', saveInteraction);

    // Delete interaction button (alleen zichtbaar in bewerkmodus)
    deleteInteractionBtn.addEventListener('click', () => {
        const contactId = deleteInteractionBtn.dataset.contactId;
        const interactionId = deleteInteractionBtn.dataset.interactionId;
        if (!contactId || !interactionId) return;

        // Calendar-waarschuwing alleen tonen als user verbonden is EN
        // deze interactie een gekoppeld Calendar-event heeft.
        const contact = contactsData.find(c => c.id === contactId);
        const interaction = contact && contact.interactions
            ? contact.interactions.find(i => i.id === interactionId)
            : null;
        const raaktCalendar = !!googleAccessToken && !!(interaction && interaction.google_calendar_event_id);
        const bericht = raaktCalendar
            ? 'Weet je zeker dat je deze interactie wilt verwijderen? Dit verwijdert ook de Google Calendar-afspraak.'
            : 'Weet je zeker dat je deze interactie wilt verwijderen?';

        if (!confirm(bericht)) return;
        interactionModal.hide();
        setTimeout(() => deleteInteraction(contactId, interactionId), 300);
    });
    
    // Current date for interaction modal
    // Bij openen van een nieuwe (lege) afspraak defaulten we op vandaag.
    // Bij bewerken heeft showInteractionModal de datum al gezet — dan
    // niet overschrijven.
    document.getElementById('interaction-modal').addEventListener('show.bs.modal', function() {
        const dateEl = document.getElementById('interaction-date');
        if (!dateEl.value) {
            dateEl.valueAsDate = new Date();
        }
    });
    
    // Export data button
    exportDataBtn.addEventListener('click', exportData);
    
    // Import data button
    importDataBtn.addEventListener('click', function() {
        importFileInput.click();
    });
    
    // Import file input change
    importFileInput.addEventListener('change', handleImportFile);

    // Contacten importeren uit telefoon (vCard-wizard)
    const importPhoneBtn = document.getElementById('import-phone-btn');
    if (importPhoneBtn) importPhoneBtn.addEventListener('click', () => openPhoneImportWizard('menu'));

    // Sort contacts dropdown
    const sortSelect = document.getElementById('sort-contacts');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            currentSortMethod = this.value;
            renderContacts();
        });
    }

    // Hoofdtabs: Vandaag | Overzicht | Contacten
    document.querySelectorAll('#main-tabs [data-view]').forEach(btn => {
        btn.addEventListener('click', () => switchMainTab(btn.dataset.view));
    });

    // "Op schema" in Overzicht springt naar Contacten
    const opSchemaCard = document.getElementById('overzicht-op-schema');
    if (opSchemaCard) {
        opSchemaCard.addEventListener('click', () => switchMainTab('contacten'));
    }
}

/**
 * Render all contacts in the UI
 */
function renderContacts() {
    // Clear existing contacts
    contactsContainer.innerHTML = '';

    // Filter contacten based on search & category
    let filtered = contactsData.filter(contact => {
        // Search filter
        if (currentSearchQuery && !contact.name.toLowerCase().includes(currentSearchQuery)) {
            return false;
        }

        // Category filter
        if (currentCategoryFilter !== 'all' && contact.categoryId !== currentCategoryFilter) {
            return false;
        }

        return true;
    });

    // Show or hide no contacts message
    if (filtered.length === 0) {
        noContactsMessage.style.display = 'block';
        if (typeof renderVandaag === 'function') renderVandaag();
        if (typeof renderOverzicht === 'function') renderOverzicht();
        return;
    } else {
        noContactsMessage.style.display = 'none';
    }

    // Sort: 'urgency' (default) = meest te laat bovenaan (urgencyRank uit
    // lib.js). 'name' = alfabetisch, locale-aware Nederlands.
    const sortToday = startOfDay(new Date());
    if (currentSortMethod === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
    } else {
        filtered.sort((a, b) => urgencyRank(b, sortToday) - urgencyRank(a, sortToday));
    }

    // Create and append contact cards
    filtered.forEach(contact => {
        const contactCard = createContactCard(contact);
        contactsContainer.appendChild(contactCard);
    });

    // Vandaag-view en Overzicht-view meerenderen (stap 4-5)
    if (typeof renderVandaag === 'function') renderVandaag();
    if (typeof renderOverzicht === 'function') renderOverzicht();
}

/**
 * Get category by ID
 * @param {string} id - Category ID
 * @returns {Object|null} - Category object or null
 */
function getCategoryById(id) {
    return categoriesData.find(c => c.id === id) || null;
}

/**
 * Get the next future planned interaction for a contact
 * @param {Object} contact - The contact data
 * @returns {Object|null} - The next planned interaction or null
 */
function getNextFuturePlannedInteraction(contact) {
    if (!contact.interactions) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futurePlanned = contact.interactions.filter(i => {
        if (!i.planned) return false;
        const date = new Date(i.date);
        return date >= today;
    });
    
    if (futurePlanned.length === 0) return null;
    
    // Sort by date ascending
    futurePlanned.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return futurePlanned[0];
}

/**
 * Create a contact card element
 * @param {Object} contact - The contact data
 * @returns {HTMLElement} - The contact card element
 */
// Contacten-tab: subtekst + right-label per contact.
function contactenRowSubtext(contact) {
    const category = contact.categoryId ? getCategoryById(contact.categoryId) : null;
    const catText = category ? category.name : '';
    const freq = contact.frequency || 30;
    return catText ? `${catText} · elke ${freq} dagen` : `elke ${freq} dagen`;
}

function contactenRowRight(contact, today) {
    const bucket = computeBucket(contact, today);
    if (bucket === BUCKETS.NU_AFSPRAAK_MAKEN) {
        return { text: formatUrgencyLabel(computeDagenTeLaat(contact, today)), cls: 'late' };
    }
    if (bucket === BUCKETS.BINNEN_TWEE_WEKEN) {
        return { text: formatUrgencyLabel(computeDagenTeLaat(contact, today)), cls: 'soon' };
    }
    if (bucket === BUCKETS.AFSPRAAK_STAAT_AL) {
        const next = getNextFuturePlannedInteraction(contact);
        return { text: next ? formatPlannedDateShort(next.date) : 'gepland', cls: 'planned' };
    }
    if (bucket === BUCKETS.NOOIT_CONTACT) {
        return { text: 'nog geen contact', cls: 'quiet' };
    }
    return { text: 'op schema', cls: 'quiet' };
}

function createContactCard(contact) {
    const today = startOfDay(new Date());
    const sub = contactenRowSubtext(contact);
    const right = contactenRowRight(contact, today);
    return renderGlistRow(contact, sub, right.text, right.cls);
}

/**
 * Calculate the days since last contact
 * @param {Object} contact - The contact data
 * @returns {number} - Days since last contact, or Infinity if no interactions
 */
function calculateDaysSinceLastContact(contact) {
    if (!contact.interactions || contact.interactions.length === 0) {
        return Infinity; // No interactions yet
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Alleen verleden en huidige interacties meetellen — toekomstige geplande negeren
    const pastDates = contact.interactions
        .map(interaction => {
            const parts = interaction.date.split('-');
            return new Date(parts[0], parts[1] - 1, parts[2]);
        })
        .filter(d => d <= today);

    if (pastDates.length === 0) return Infinity;

    const mostRecentDate = new Date(Math.max.apply(null, pastDates));
    const diffTime = today - mostRecentDate;
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate the percentage of time elapsed since last contact relative to desired frequency
 * @param {Object} contact - The contact data
 * @returns {number} - Percentage (0-100)
 */
function calculateTimePercentage(contact) {
    const daysSinceLastContact = calculateDaysSinceLastContact(contact);
    const frequency = contact.frequency || 30;
    
    // If no interactions yet, return 100% (urgent)
    if (daysSinceLastContact === Infinity) {
        return 100;
    }
    
    // Calculate percentage
    const percentage = (daysSinceLastContact / frequency) * 100;
    return Math.min(percentage, 100); // Cap at 100%
}

/**
 * Calculate days remaining until next contact is due
 * @param {Object} contact - The contact data
 * @returns {number} - Days remaining, or 0 if overdue
 */
function calculateDaysRemaining(contact) {
    const daysSinceLastContact = calculateDaysSinceLastContact(contact);
    const frequency = contact.frequency || 30;
    
    // If no interactions yet, return 0 (contact needed now)
    if (daysSinceLastContact === Infinity) {
        return 0;
    }
    
    const daysRemaining = frequency - daysSinceLastContact;
    return Math.max(0, daysRemaining);
}

/**
 * Get contact status based on percentage
 * @param {number} percentage - The percentage value
 * @returns {string} - Status code (good, warning, danger)
 */
function getContactStatus(percentage) {
    if (percentage < 70) {
        return 'good';
    } else if (percentage < 90) {
        return 'warning';
    } else {
        return 'danger';
    }
}

/**
 * Check if contact is due for interaction
 * @param {Object} contact - The contact data
 * @returns {boolean} - True if contact is due
 */
function isContactDue(contact) {
    const percentage = calculateTimePercentage(contact);
    return percentage >= 90;
}

// Pure logica (BUCKETS, computeBucket, formatters, avatar-helpers,
// telefoon-normalize, etc.) staat in js/lib.js — die MOET voor app.js
// in de HTML geladen worden. Hieronder alleen DOM-gebonden helpers.

// --- Vandaag-scherm -----------------------------------------------------

let attemptsData = [];

function attemptsForContact(contactId) {
    return attemptsData.filter(a => a.contact_id === contactId);
}

// Avatar-kleur uit categorie (heeft toegang nodig tot categoriesData
// via getCategoryById, dus DOM-scope).
function getContactAvatarColor(contact) {
    if (!contact) return AVATAR_FALLBACK_COLOR;
    const category = contact.categoryId ? getCategoryById(contact.categoryId) : null;
    return category && category.color ? category.color : AVATAR_FALLBACK_COLOR;
}

// size: 'sm' (32px, list-rijen), 'md' (36px, Vandaag-kaart), 'lg' (48px, modal-header)
function renderAvatarHtml(contact, size) {
    const cls = size ? `avatar avatar-${size}` : 'avatar';
    const color = getContactAvatarColor(contact);
    const initials = getContactInitials(contact);
    return `<div class="${cls}" style="background:${color}">${initials}</div>`;
}

function renderVandaag() {
    const cardsContainer = document.getElementById('vandaag-cards');
    const restnote = document.getElementById('vandaag-restnote');
    const empty = document.getElementById('vandaag-empty');
    const lead = document.getElementById('vandaag-lead');
    const sub = document.getElementById('vandaag-sub');
    if (!cardsContainer || !restnote || !empty || !lead || !sub) return;

    const today = startOfDay(new Date());
    const overdue = contactsData
        .map(c => ({ c, dtl: computeDagenTeLaat(c, today) }))
        .filter(x => computeBucket(x.c, today) === BUCKETS.NU_AFSPRAAK_MAKEN)
        .sort((a, b) => b.dtl - a.dtl);

    cardsContainer.innerHTML = '';

    if (overdue.length === 0) {
        lead.style.display = 'none';
        sub.style.display = 'none';
        restnote.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    lead.style.display = '';
    sub.style.display = '';
    empty.style.display = 'none';

    const top = overdue.slice(0, 3);
    const rest = overdue.length - top.length;

    lead.textContent = 'Tijd voor een catch-up';

    top.forEach(({ c, dtl }) => {
        const attempt = getRecentAttempt(attemptsForContact(c.id));
        cardsContainer.appendChild(renderVandaagCard(c, dtl, attempt, today));
    });

    if (rest > 0) {
        restnote.textContent = rest === 1
            ? 'Nog 1 contact staat te lang open.'
            : `Nog ${rest} contacten staan te lang open.`;
        restnote.style.display = '';
    } else {
        restnote.style.display = 'none';
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
}

// Toont een inline melding wanneer een reach-knop niet kan worden gebruikt.
// `field` is 'phone' of 'email'.
function showMissingInfo(container, contact, field) {
    if (!container) return;
    const labelWord = field === 'phone' ? 'telefoonnummer' : 'e-mailadres';
    container.innerHTML = `
        <span>Geen ${labelWord} bekend voor ${escapeHtml(contact.name)}.</span>
        <button type="button" class="missing-info-edit">Bewerken</button>
    `;
    container.style.display = '';
    container.querySelector('.missing-info-edit').addEventListener('click', () => {
        // Details-modal was mogelijk open — sluit hem eerst.
        if (typeof detailsModal !== 'undefined' && detailsModal) {
            detailsModal.hide();
        }
        setTimeout(() => editContact(contact.id), 200);
    });
}

function renderVandaagCard(contact, dagenTeLaat, attempt, today) {
    const wrapper = document.createElement('div');
    wrapper.className = 'vandaag-card';
    wrapper.dataset.contactId = contact.id;

    const category = contact.categoryId ? getCategoryById(contact.categoryId) : null;
    const categoryText = category ? category.name : '';
    const lastDate = getLastPastInteractionDate(contact, today);
    const lastDateText = lastDate
        ? `${lastDate.getDate()} ${NL_MONTHS[lastDate.getMonth()]} ${lastDate.getFullYear()}`
        : '';
    const freq = contact.frequency || 30;

    const metaParts = [];
    if (categoryText) metaParts.push(categoryText);
    if (lastDateText) metaParts.push(`laatste contact ${lastDateText}`);
    metaParts.push(`elke ${freq} dagen`);

    const phone = getContactPhone(contact);
    const email = getContactEmail(contact);
    const attemptLabel = formatAttemptLabel(attempt, new Date());

    wrapper.innerHTML = `
        <div class="v-head">
            ${renderAvatarHtml(contact, 'md')}
            <span class="v-name">${escapeHtml(contact.name)}</span>
            <span class="v-flag">${escapeHtml(formatUrgencyLabel(dagenTeLaat))}</span>
        </div>
        <p class="v-meta">${escapeHtml(metaParts.join(' · '))}</p>
        ${attemptLabel ? `<p class="v-attempt">${escapeHtml(attemptLabel)}</p>` : ''}
        <div class="v-reach" role="group" aria-label="Bereik">
            <button type="button" data-action="bellen" class="${phone ? '' : 'is-disabled'}">Bellen</button>
            <button type="button" data-action="whatsapp" class="${phone ? '' : 'is-disabled'}">WhatsApp</button>
            <button type="button" data-action="mail" class="${email ? '' : 'is-disabled'}">Mail</button>
        </div>
        <div class="missing-info" style="display: none;"></div>
        <button type="button" class="v-primary" data-action="plan">Nu afspraak maken</button>
    `;

    const bellen = wrapper.querySelector('[data-action="bellen"]');
    const wapp = wrapper.querySelector('[data-action="whatsapp"]');
    const mail = wrapper.querySelector('[data-action="mail"]');
    const plan = wrapper.querySelector('[data-action="plan"]');
    const missingInfo = wrapper.querySelector('.missing-info');

    bellen.addEventListener('click', () => {
        if (phone) handleReach(contact, 'bellen');
        else showMissingInfo(missingInfo, contact, 'phone');
    });
    wapp.addEventListener('click', () => {
        if (phone) handleReach(contact, 'whatsapp');
        else showMissingInfo(missingInfo, contact, 'phone');
    });
    mail.addEventListener('click', () => {
        if (email) handleReach(contact, 'mail');
        else showMissingInfo(missingInfo, contact, 'email');
    });
    plan.addEventListener('click', () => handlePlan(contact));

    // Klik op naam of avatar (niet op knoppen) opent details
    const head = wrapper.querySelector('.v-head');
    head.style.cursor = 'pointer';
    head.addEventListener('click', () => showContactDetails(contact.id));

    return wrapper;
}

function handleReach(contact, kanaal) {
    let url = null;
    if (kanaal === 'bellen') {
        const phone = getContactPhone(contact);
        if (phone) url = `tel:${phone.replace(/\s+/g, '')}`;
    } else if (kanaal === 'whatsapp') {
        const wa = normalizePhoneForWa(getContactPhone(contact));
        if (wa) url = `https://wa.me/${wa}`;
    } else if (kanaal === 'mail') {
        const email = getContactEmail(contact);
        if (email) url = `mailto:${email}`;
    }
    if (!url) return;

    if (kanaal === 'whatsapp') {
        window.open(url, '_blank');
    } else {
        window.location.href = url;
    }
    logAttempt(contact.id, kanaal);
}

function handlePlan(contact) {
    openNewInteraction(contact.id);
}

// --- Slot-zoeker wizard ---------------------------------------------------

let slotWizardModal = null;
// Monotonic token dat incrementeert bij elke nieuwe wizard-open of preset-pick.
// searchSlots capturet de waarde bij start en dropt zijn resultaat als de user
// tussentijds de wizard sloot of opnieuw opende.
let slotWizardSearchId = 0;
let slotWizardState = {
    contactId: null,
    step: 'preset',       // 'preset' | 'anders' | 'loading' | 'results'
    preset: null,         // 'lunch' | 'diner' | 'anders'
    andersInput: { starttijd: '14:00', duur: 60 },
    horizon: 30,
    proposals: [],        // gevuld in results-stap
    searchStartOffset: 0, // dagOffset waar volgende zoek-actie start (paginatie)
    heeftMeer: false      // true als "Volgende 5" nog resultaten kan opleveren
};

function openSlotWizard(contactId) {
    slotWizardSearchId++;   // invalidate lopende searchSlots-aanroepen
    slotWizardState = {
        contactId,
        step: 'preset',
        preset: null,
        andersInput: { starttijd: '14:00', duur: 60 },
        horizon: 30,
        proposals: [],
        searchStartOffset: 0,
        heeftMeer: false
    };
    const el = document.getElementById('slot-wizard-modal');
    if (!el) {
        // Fallback: als de modal-HTML ontbreekt, gewoon direct interaction openen.
        showInteractionModal(contactId);
        return;
    }
    if (!slotWizardModal) {
        slotWizardModal = new bootstrap.Modal(el);
        // Bij sluiten via X/Esc/backdrop: invalidate lopende searchSlots.
        el.addEventListener('hidden.bs.modal', () => { slotWizardSearchId++; });
    }
    renderWizard();
    slotWizardModal.show();
}

function renderWizard() {
    const body = document.getElementById('slot-wizard-body');
    if (!body) return;
    if (slotWizardState.step === 'preset') return renderWizardPreset(body);
    if (slotWizardState.step === 'anders') return renderWizardAnders(body);
    if (slotWizardState.step === 'loading') return renderWizardLoading(body);
    if (slotWizardState.step === 'results') return renderWizardResults(body);
}

function renderWizardPreset(body) {
    const contact = contactsData.find(c => c.id === slotWizardState.contactId);
    const contactName = contact ? contact.name : '';
    const fallback = !googleAccessToken;

    body.innerHTML = `
        <h2 class="wizard-step-title">Zoek een vrij moment</h2>
        <p class="wizard-step-sub">${escapeHtml('Voor afspraak met ' + contactName)}</p>

        ${fallback ? `
            <div class="fallback-warn">
                <b>Google Calendar niet verbonden.</b> Kies een preset — het formulier opent direct met tijd en titel voorgevuld. De datum kies je zelf.
                <br><button type="button" data-action="connect">Nu verbinden</button>
            </div>
        ` : ''}

        <button class="preset-btn" type="button" data-preset="lunch">
            <span class="preset-icon">🍽</span><span class="preset-title">Lunch</span>
            <div class="preset-meta">Start tussen 11:30–12:00 · 90 min</div>
        </button>
        <button class="preset-btn" type="button" data-preset="diner">
            <span class="preset-icon">🍷</span><span class="preset-title">Diner</span>
            <div class="preset-meta">Start tussen 18:00–19:30 · 3 uur</div>
        </button>
        <button class="preset-btn" type="button" data-preset="anders">
            <span class="preset-icon">⚙️</span><span class="preset-title">Anders</span>
            <div class="preset-meta">Eigen tijd + duur — slots zoeken</div>
        </button>
        <button class="preset-btn" type="button" data-preset="manual">
            <span class="preset-icon">✏️</span><span class="preset-title">Zelf invullen</span>
            <div class="preset-meta">Direct naar formulier — kies zelf datum + tijd</div>
        </button>

        <div class="horizon-box">
            <label>Aantal dagen vooruit</label>
            <div class="horizon-choices">
                <button type="button" class="horizon-preset" data-horizon="30">30</button>
                <button type="button" class="horizon-preset" data-horizon="60">60</button>
                <button type="button" class="horizon-preset" data-horizon="90">90</button>
                <span class="horizon-custom-label">Of eigen:</span>
                <input type="number" min="1" max="365" value="${slotWizardState.horizon}" id="wizard-horizon-input">
                <span class="horizon-unit">dagen</span>
            </div>
        </div>
    `;

    body.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => handlePresetPick(btn.dataset.preset));
    });

    // Highlight de juiste horizon-preset button als de huidige waarde matcht.
    const horizonInput = body.querySelector('#wizard-horizon-input');
    const horizonBtns = body.querySelectorAll('.horizon-preset');
    function reflectHorizon() {
        horizonBtns.forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.horizon, 10) === slotWizardState.horizon);
        });
    }
    reflectHorizon();
    horizonBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const v = parseInt(btn.dataset.horizon, 10);
            slotWizardState.horizon = v;
            horizonInput.value = v;
            reflectHorizon();
        });
    });
    horizonInput.addEventListener('change', () => {
        const v = parseInt(horizonInput.value, 10);
        if (v > 0 && v <= 365) slotWizardState.horizon = v;
        reflectHorizon();
    });
    const connectBtn = body.querySelector('[data-action="connect"]');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            connectGoogleCalendar(
                () => renderWizard(),  // success: rerender zonder fallback-warn
                () => {}                // failure: blijf in fallback
            );
        });
    }
}

function handlePresetPick(preset) {
    slotWizardState.preset = preset;
    if (preset === 'manual') {
        // Zelf invullen: skip wizard, open leeg formulier (datum = vandaag default).
        openManualInteractionEntry();
    } else if (preset === 'anders') {
        slotWizardState.step = 'anders';
        renderWizard();
    } else if (!googleAccessToken) {
        // Geen Calendar → voorstellen hebben geen toegevoegde waarde. Skip
        // meteen naar interaction-modal met tijd + titel voorgevuld.
        openInteractionModalFromPreset();
    } else {
        slotWizardState.step = 'loading';
        renderWizard();
        searchSlots();
    }
}

// Sluit de wizard en opent het lege interaction-formulier (geen prefill).
// Datum defaultt naar vandaag via show.bs.modal-handler.
function openManualInteractionEntry() {
    if (slotWizardModal) slotWizardModal.hide();
    setTimeout(() => {
        showInteractionModal(slotWizardState.contactId);
    }, 300);
}

// Sluit de wizard en opent de interaction-modal direct, zonder voorstellen-
// stap. Gebruikt door de fallback-flow als Google Calendar niet verbonden is.
// Datum blijft leeg → interaction-modal defaultt naar vandaag.
function openInteractionModalFromPreset() {
    const spec = presetSpec(slotWizardState.preset, slotWizardState.andersInput);
    if (!spec) return;
    const contact = contactsData.find(c => c.id === slotWizardState.contactId);
    const contactName = contact ? contact.name : '';
    const title = spec.titelTemplate
        ? spec.titelTemplate.replace('{naam}', contactName)
        : null;
    const startTime = spec.startVensterVan;
    const endTime = addMinutes(startTime, spec.duur);
    const prefill = { start_time: startTime, end_time: endTime, title };

    if (slotWizardModal) slotWizardModal.hide();
    setTimeout(() => {
        showInteractionModal(slotWizardState.contactId, null, prefill);
    }, 300);
}

function renderWizardAnders(body) {
    const s = slotWizardState.andersInput;
    const fallback = !googleAccessToken;

    body.innerHTML = `
        <h2 class="wizard-step-title">Eigen tijd</h2>
        <p class="wizard-step-sub">Kies exacte tijd en duur</p>

        ${fallback ? `
            <div class="fallback-warn">
                <b>Google Calendar niet verbonden.</b> Vul tijd + duur in — het formulier opent direct.
                <br><button type="button" data-action="connect">Nu verbinden</button>
            </div>
        ` : ''}

        <div class="anders-form">
            <label for="wizard-anders-tijd">Starttijd</label>
            <input type="time" id="wizard-anders-tijd" value="${s.starttijd}">
            <label for="wizard-anders-duur">Duur (minuten)</label>
            <input type="number" id="wizard-anders-duur" min="15" step="15" value="${s.duur}">
        </div>

        <div class="wizard-actions">
            <button type="button" data-action="back">Terug</button>
            <button type="button" class="primary" data-action="search">${fallback ? 'Formulier openen' : 'Zoek slots'}</button>
        </div>
    `;

    body.querySelector('[data-action="back"]').addEventListener('click', () => {
        slotWizardState.step = 'preset';
        renderWizard();
    });
    body.querySelector('[data-action="search"]').addEventListener('click', () => {
        // Bewaar starttijd (leeg veld valt terug op vorige waarde) en duur
        // (binnen 15..24u; ongeldige input → default 60).
        const tijdVal = body.querySelector('#wizard-anders-tijd').value;
        if (tijdVal) slotWizardState.andersInput.starttijd = tijdVal;
        const rawDuur = parseInt(body.querySelector('#wizard-anders-duur').value, 10);
        slotWizardState.andersInput.duur = (rawDuur > 0 && rawDuur <= 24 * 60) ? rawDuur : 60;
        if (!googleAccessToken) {
            openInteractionModalFromPreset();
            return;
        }
        slotWizardState.step = 'loading';
        renderWizard();
        searchSlots();
    });
    const connectBtn = body.querySelector('[data-action="connect"]');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            connectGoogleCalendar(() => renderWizard(), () => {});
        });
    }
}
function renderWizardResults(body) {
    const spec = presetSpec(slotWizardState.preset, slotWizardState.andersInput);
    const proposals = slotWizardState.proposals;
    const contact = contactsData.find(c => c.id === slotWizardState.contactId);
    const contactName = contact ? contact.name : '';
    const proposalTitle = spec && spec.titelTemplate
        ? spec.titelTemplate.replace('{naam}', contactName)
        : 'Afspraak (voorstel)';

    const labelParts = [];
    if (slotWizardState.preset === 'lunch') labelParts.push('🍽 Lunch · 90 min');
    else if (slotWizardState.preset === 'diner') labelParts.push('🍷 Diner · 3 uur');
    else labelParts.push(`⚙️ Eigen · ${slotWizardState.andersInput?.duur ?? '?'} min`);
    labelParts.push(`komende ${slotWizardState.horizon} dagen`);

    body.innerHTML = `
        <h2 class="wizard-step-title">Voorstellen</h2>
        <p class="wizard-step-sub">${escapeHtml(labelParts.join(' · '))}</p>

        ${proposals.length === 0 ? `
            <div class="wizard-empty">
                <div class="empty-title">Geen vrije slots gevonden</div>
                <div>Probeer een langere horizon of andere tijden.</div>
            </div>
        ` : proposals.map((p, i) => {
            const items = bouwAgendaItems(p.events, p.slot, proposalTitle);
            const dayLabel = `${NL_WEEKDAYS_SHORT[p.date.getDay()]} ${p.date.getDate()} ${NL_MONTHS[p.date.getMonth()]}`;
            const timedNaastVoorstel = items.filter(it => !it.allDay && !it.isProposal).length;
            return `
                <button type="button" class="wizard-slot" data-proposal-index="${i}">
                    <div class="day-header">${escapeHtml(dayLabel)}</div>
                    ${timedNaastVoorstel === 0 ? '<div class="wizard-agenda-row empty"><span class="time">Verder niks</span></div>' : ''}
                    ${items.map(it => it.allDay ? `
                        <div class="wizard-agenda-row allday">
                            <span class="time">Hele dag</span>
                            <span class="title">${escapeHtml(it.title)}</span>
                        </div>
                    ` : `
                        <div class="wizard-agenda-row ${it.isProposal ? 'proposal' : ''}${it.isViewOnly ? ' view-only' : ''}">
                            <span class="time">${escapeHtml(it.start)}–${escapeHtml(it.end)}</span>
                            <span class="title">${escapeHtml(it.title)}${it.isProposal ? ' ← voorstel' : ''}</span>
                        </div>
                    `).join('')}
                </button>
            `;
        }).join('')}

        <div class="wizard-actions">
            <button type="button" data-action="back">Terug</button>
            ${slotWizardState.heeftMeer ? '<button type="button" data-action="next">Volgende 5 →</button>' : ''}
        </div>
    `;

    body.querySelectorAll('.wizard-slot[data-proposal-index]').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.proposalIndex, 10);
            chooseSlot(idx);
        });
    });
    body.querySelector('[data-action="back"]').addEventListener('click', () => {
        slotWizardState.step = 'preset';
        slotWizardState.searchStartOffset = 0;
        slotWizardState.heeftMeer = false;
        renderWizard();
    });
    const nextBtn = body.querySelector('[data-action="next"]');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            slotWizardState.step = 'loading';
            renderWizard();
            searchSlots(true);
        });
    }
}

function chooseSlot(idx) {
    const proposal = slotWizardState.proposals[idx];
    if (!proposal) return;

    const spec = presetSpec(slotWizardState.preset, slotWizardState.andersInput);
    const contact = contactsData.find(c => c.id === slotWizardState.contactId);
    const contactName = contact ? contact.name : '';
    const title = spec && spec.titelTemplate
        ? spec.titelTemplate.replace('{naam}', contactName)
        : null;

    const prefill = {
        date: proposal.dateStr,
        start_time: proposal.slot.startTime,
        end_time: proposal.slot.endTime,
        title
    };

    if (slotWizardModal) slotWizardModal.hide();
    setTimeout(() => {
        showInteractionModal(slotWizardState.contactId, null, prefill);
    }, 300);
}

function renderWizardLoading(body) {
    body.innerHTML = `
        <div class="wizard-loading">
            <div class="spinner"></div>
            <div>${googleAccessToken ? 'Zoeken in Google Calendar…' : 'Voorstellen genereren…'}</div>
        </div>
    `;
}

async function searchSlots(paginate = false) {
    slotWizardSearchId++;
    const mySearchId = slotWizardSearchId;

    const spec = presetSpec(slotWizardState.preset, slotWizardState.andersInput);
    if (!spec) {
        if (mySearchId !== slotWizardSearchId) return;
        slotWizardState.proposals = [];
        slotWizardState.heeftMeer = false;
        slotWizardState.step = 'results';
        renderWizard();
        return;
    }

    const proposals = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const hasCalendar = !!googleAccessToken;
    const startOffset = paginate ? slotWizardState.searchStartOffset : 0;
    let laatsteGevuldOffset = -1;

    for (let dayOffset = startOffset; dayOffset < slotWizardState.horizon; dayOffset++) {
        if (proposals.length >= 5) break;

        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        let events = [];
        let slot;

        if (hasCalendar) {
            events = await listCalendarEventsForDay(dateStr);
            // User heeft ondertussen wizard gesloten / opnieuw geopend?
            // Drop dit resultaat om stale writes te voorkomen.
            if (mySearchId !== slotWizardSearchId) return;
            slot = vindVrijeSlot(events, spec.startVensterVan, spec.startVensterTot, spec.duur);
        } else {
            // Fallback: geen check, gebruik gewoon de preset-start.
            slot = { startTime: spec.startVensterVan, endTime: addMinutes(spec.startVensterVan, spec.duur) };
        }

        if (slot) {
            proposals.push({ dateStr, date: d, slot, events });
            laatsteGevuldOffset = dayOffset;
        }
    }

    if (mySearchId !== slotWizardSearchId) return;
    slotWizardState.proposals = proposals;
    slotWizardState.searchStartOffset = laatsteGevuldOffset + 1;
    slotWizardState.heeftMeer = proposals.length >= 5 && slotWizardState.searchStartOffset < slotWizardState.horizon;
    slotWizardState.step = 'results';
    renderWizard();
}

// Ingang voor "nieuwe afspraak". Checkt eerst of Google Calendar verbonden
// is. Nooit-verbonden gebruikers zien geen prompt. Ooit-verbonden zonder
// actieve token krijgen een keuze: opnieuw verbinden of doorgaan zonder
// Calendar. Het openen van de interactie-modal gebeurt in beide gevallen.
let pendingInteractionContactId = null;
let calendarReconnectModal = null;

function openNewInteraction(contactId) {
    if (googleAccessToken) {
        openSlotWizard(contactId);
        return;
    }
    const everConnected = localStorage.getItem('google_calendar_ever_connected') === 'true';
    if (!everConnected) {
        openSlotWizard(contactId);
        return;
    }
    if (typeof google === 'undefined' || !google.accounts) {
        // GIS niet geladen — geen zin om te prompten, gewoon door.
        openSlotWizard(contactId);
        return;
    }
    // Toon de prompt en onthoud voor welk contact we straks openen
    pendingInteractionContactId = contactId;
    if (!calendarReconnectModal) {
        const el = document.getElementById('calendar-reconnect-modal');
        if (!el) { openSlotWizard(contactId); return; }
        calendarReconnectModal = new bootstrap.Modal(el);
    }
    calendarReconnectModal.show();
}

function handleCalendarReconnectClick() {
    const contactId = pendingInteractionContactId;
    if (calendarReconnectModal) calendarReconnectModal.hide();
    // Start OAuth-flow; open slot-wizard in beide takken zodra klaar
    connectGoogleCalendar(
        () => { if (contactId) openSlotWizard(contactId); },
        () => { if (contactId) openSlotWizard(contactId); }
    );
    pendingInteractionContactId = null;
}

function handleCalendarSkipClick() {
    const contactId = pendingInteractionContactId;
    if (calendarReconnectModal) calendarReconnectModal.hide();
    if (contactId) openSlotWizard(contactId);
    pendingInteractionContactId = null;
}

function logAttempt(contactId, kanaal) {
    const now = new Date();
    const tempAttempt = {
        id: 'local-' + generateUniqueId(),
        user_id: currentUser ? currentUser.id : null,
        contact_id: contactId,
        kanaal,
        created_at: now.toISOString()
    };
    attemptsData.push(tempAttempt);
    renderVandaag();
    renderOverzicht();

    if (!isSupabaseConfigured() || !currentUser) return;

    supabaseClient
        .from('attempts')
        .insert({ user_id: currentUser.id, contact_id: contactId, kanaal })
        .select()
        .single()
        .then(({ data, error }) => {
            if (error) {
                console.warn('Kon poging niet wegschrijven:', error);
                return;
            }
            const idx = attemptsData.findIndex(a => a.id === tempAttempt.id);
            if (idx !== -1 && data) attemptsData[idx] = data;
        });
}

async function loadAttemptsFromSupabase() {
    if (!isSupabaseConfigured() || !currentUser) {
        attemptsData = [];
        return;
    }
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseClient
        .from('attempts')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('created_at', cutoff);
    if (error) {
        console.warn('Kon attempts niet laden (tabel bestaat mogelijk nog niet):', error);
        attemptsData = [];
        return;
    }
    attemptsData = data || [];
}

function switchMainTab(view) {
    const views = {
        vandaag: { tab: 'tab-vandaag', view: 'vandaag-view' },
        overzicht: { tab: 'tab-overzicht', view: 'overzicht-view' },
        contacten: { tab: 'tab-contacten', view: 'contacten-view' }
    };
    if (!views[view]) return;
    Object.entries(views).forEach(([key, ids]) => {
        const tab = document.getElementById(ids.tab);
        const el = document.getElementById(ids.view);
        if (!tab || !el) return;
        const active = key === view;
        tab.classList.toggle('active', active);
        el.style.display = active ? '' : 'none';
    });
}

// --- Overzicht-scherm ----------------------------------------------------
// BUCKET_COLORS, BUCKET_TITLES en formatPlannedDateShort staan in lib.js.

function overzichtRowSubtext(contact, bucket, today) {
    const category = contact.categoryId ? getCategoryById(contact.categoryId) : null;
    const catText = category ? category.name : '';
    if (bucket === BUCKETS.NU_AFSPRAAK_MAKEN) {
        const days = daysSinceLastPastInteraction(contact, today);
        const daysText = `${days} ${dagWoord(days)} geen contact`;
        return catText ? `${catText} · ${daysText}` : daysText;
    }
    if (bucket === BUCKETS.BINNEN_TWEE_WEKEN) {
        const freq = contact.frequency || 30;
        return catText ? `${catText} · elke ${freq} dagen` : `elke ${freq} dagen`;
    }
    if (bucket === BUCKETS.AFSPRAAK_STAAT_AL) {
        const freq = contact.frequency || 30;
        const next = getNextFuturePlannedInteraction(contact);
        const parts = [];
        if (catText) parts.push(catText);
        parts.push(`elke ${freq} dagen`);
        if (next && next.title) parts.push(next.title);
        else if (next && next.notes) parts.push(next.notes);
        return parts.join(' · ');
    }
    if (bucket === BUCKETS.NOOIT_CONTACT) {
        const freq = contact.frequency || 30;
        return catText ? `${catText} · elke ${freq} dagen` : `elke ${freq} dagen`;
    }
    return catText;
}

function overzichtRowRightLabel(contact, bucket, today) {
    if (bucket === BUCKETS.NU_AFSPRAAK_MAKEN || bucket === BUCKETS.BINNEN_TWEE_WEKEN) {
        return { text: formatUrgencyLabel(computeDagenTeLaat(contact, today)) };
    }
    if (bucket === BUCKETS.AFSPRAAK_STAAT_AL) {
        const next = getNextFuturePlannedInteraction(contact);
        return { text: next ? formatPlannedDateShort(next.date) : '' };
    }
    if (bucket === BUCKETS.NOOIT_CONTACT) {
        return { text: 'nog geen contact' };
    }
    return { text: '' };
}

function renderOverzicht() {
    const container = document.getElementById('overzicht-sections');
    const opSchemaCard = document.getElementById('overzicht-op-schema');
    const opSchemaCount = document.getElementById('overzicht-op-schema-count');
    const empty = document.getElementById('overzicht-empty');
    if (!container || !opSchemaCard || !opSchemaCount || !empty) return;

    container.innerHTML = '';

    const today = startOfDay(new Date());
    const byBucket = {
        [BUCKETS.NU_AFSPRAAK_MAKEN]: [],
        [BUCKETS.BINNEN_TWEE_WEKEN]: [],
        [BUCKETS.AFSPRAAK_STAAT_AL]: [],
        [BUCKETS.NOOIT_CONTACT]: [],
        [BUCKETS.OP_SCHEMA]: []
    };
    contactsData.forEach(c => {
        byBucket[computeBucket(c, today)].push(c);
    });

    byBucket[BUCKETS.NU_AFSPRAAK_MAKEN].sort((a, b) =>
        computeDagenTeLaat(b, today) - computeDagenTeLaat(a, today));
    byBucket[BUCKETS.BINNEN_TWEE_WEKEN].sort((a, b) =>
        computeDagenTeLaat(a, today) - computeDagenTeLaat(b, today));
    byBucket[BUCKETS.AFSPRAAK_STAAT_AL].sort((a, b) => {
        const ap = getNextFuturePlannedInteraction(a);
        const bp = getNextFuturePlannedInteraction(b);
        if (!ap || !bp) return 0;
        return parseLocalDate(ap.date) - parseLocalDate(bp.date);
    });

    const geprobeerd = [
        ...byBucket[BUCKETS.NU_AFSPRAAK_MAKEN],
        ...byBucket[BUCKETS.BINNEN_TWEE_WEKEN]
    ]
        .map(c => ({ c, attempt: getRecentAttempt(attemptsForContact(c.id)) }))
        .filter(x => x.attempt !== null)
        .sort((a, b) => new Date(b.attempt.created_at) - new Date(a.attempt.created_at));

    const order = [
        { key: BUCKETS.NU_AFSPRAAK_MAKEN, contacts: byBucket[BUCKETS.NU_AFSPRAAK_MAKEN] },
        { key: BUCKETS.BINNEN_TWEE_WEKEN, contacts: byBucket[BUCKETS.BINNEN_TWEE_WEKEN] },
        { key: BUCKETS.AFSPRAAK_STAAT_AL, contacts: byBucket[BUCKETS.AFSPRAAK_STAAT_AL] },
        { key: 'geprobeerd', geprobeerd },
        { key: BUCKETS.NOOIT_CONTACT, contacts: byBucket[BUCKETS.NOOIT_CONTACT] }
    ];

    const totalInVisible = order.reduce((n, s) => n + (s.geprobeerd ? s.geprobeerd.length : s.contacts.length), 0);
    const totalOpSchema = byBucket[BUCKETS.OP_SCHEMA].length;

    if (totalInVisible === 0 && totalOpSchema === 0) {
        empty.style.display = 'block';
        opSchemaCard.style.display = 'none';
        return;
    }
    empty.style.display = 'none';

    order.forEach(section => {
        if (section.geprobeerd) {
            if (section.geprobeerd.length === 0) return;
            container.appendChild(renderOverzichtGeprobeerd(section.geprobeerd));
        } else {
            if (section.contacts.length === 0) return;
            container.appendChild(renderOverzichtSection(section.key, section.contacts, today));
        }
    });

    opSchemaCount.textContent = totalOpSchema;
    opSchemaCard.style.display = totalOpSchema > 0 ? '' : 'none';
}

// rightLabelClass staat in lib.js.

function renderGlistRow(contact, subtext, rightText, rightClass) {
    const row = document.createElement('div');
    row.className = 'glist-row';
    row.dataset.contactId = contact.id;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.innerHTML = `
        ${renderAvatarHtml(contact, 'sm')}
        <div class="who-block">
            <div class="who">${escapeHtml(contact.name)}</div>
            ${subtext ? `<div class="when">${escapeHtml(subtext)}</div>` : ''}
        </div>
        <div class="right ${rightClass}">${escapeHtml(rightText || '')}</div>
    `;
    row.addEventListener('click', () => showContactDetails(contact.id));
    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showContactDetails(contact.id);
        }
    });
    return row;
}

function renderOverzichtSection(bucketKey, contacts, today) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mb-4 overzicht-section';
    wrapper.dataset.bucket = bucketKey;

    const header = document.createElement('div');
    header.className = 'overzicht-ghead';
    header.innerHTML = `
        <span class="gdot" style="background:${BUCKET_COLORS[bucketKey]}"></span>
        <span>${escapeHtml(BUCKET_TITLES[bucketKey])}</span>
        <span class="gcount">${contacts.length}</span>
    `;
    wrapper.appendChild(header);

    const list = document.createElement('div');
    list.className = 'glist';
    const rightClass = rightLabelClass(bucketKey);
    contacts.forEach(c => {
        const sub = overzichtRowSubtext(c, bucketKey, today);
        const right = overzichtRowRightLabel(c, bucketKey, today);
        list.appendChild(renderGlistRow(c, sub, right.text, rightClass));
    });
    wrapper.appendChild(list);
    return wrapper;
}

function renderOverzichtGeprobeerd(items) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mb-4 overzicht-section';
    wrapper.dataset.bucket = 'geprobeerd';

    const header = document.createElement('div');
    header.className = 'overzicht-ghead';
    header.innerHTML = `
        <span class="gdot" style="background:${BUCKET_COLORS.geprobeerd}"></span>
        <span>${escapeHtml(BUCKET_TITLES.geprobeerd)}</span>
        <span class="gcount">${items.length}</span>
    `;
    wrapper.appendChild(header);

    const list = document.createElement('div');
    list.className = 'glist';
    items.forEach(({ c, attempt }) => {
        const label = formatAttemptLabel(attempt, new Date());
        list.appendChild(renderGlistRow(c, label, 'opnieuw?', 'quiet'));
    });
    wrapper.appendChild(list);
    return wrapper;
}

if (typeof window !== 'undefined') {
    window.computeBucket = computeBucket;
    window.computeDagenTeLaat = computeDagenTeLaat;
    window.getRecentAttempt = getRecentAttempt;
    window.formatUrgencyLabel = formatUrgencyLabel;
    window.formatAttemptLabel = formatAttemptLabel;
    window.renderVandaag = renderVandaag;
    window.renderOverzicht = renderOverzicht;
    window.switchMainTab = switchMainTab;
    window.BUCKETS = BUCKETS;
}

/**
 * Get the next future planned interaction for a contact
 * @param {Object} contact - The contact data
 * @returns {Object|null} - The next planned interaction or null
 */
function getNextFuturePlannedInteraction(contact) {
    if (!contact.interactions) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futurePlanned = contact.interactions.filter(i => {
        if (!i.planned) return false;
        const parts = i.date.split('-');
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date >= today;
    });

    if (futurePlanned.length === 0) return null;

    // Sort by date ascending
    futurePlanned.sort((a, b) => new Date(a.date) - new Date(b.date));

    return futurePlanned[0];
}

/**
 * Format days until label
 * @param {number} days - Number of days
 * @returns {string} - Formatted label
 */
function formatDaysUntilLabel(days) {
    if (days < 0) {
        if (days === -1) return 'Gisteren';
        return `${Math.abs(days)} dagen geleden`;
    } else if (days === 0) {
        return 'Vandaag';
    } else if (days === 1) {
        return 'Morgen';
    } else {
        return `Over ${days} dagen`;
    }
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Format a time range for display (handles Supabase "HH:MM:SS" format)
 * @param {string} startTime - Start time string
 * @param {string} endTime - End time string (optional)
 * @returns {string} - Formatted time range, e.g. "12:00–13:00" or "12:00"
 */
function formatTimeRange(startTime, endTime) {
    if (!startTime) return '';
    const s = String(startTime).substring(0, 5);
    const e = endTime ? String(endTime).substring(0, 5) : '';
    return e ? `${s}–${e}` : s;
}

/**
 * Format last contact date with relative time
 * @param {Object} contact - The contact data
 * @returns {string} - Formatted date string
 */
function formatLastContactDate(contact) {
    if (!contact.interactions || contact.interactions.length === 0) {
        return 'Nooit';
    }

    const daysSince = calculateDaysSinceLastContact(contact);

    if (daysSince === Infinity) return 'Nooit';
    if (daysSince === 0) return 'Vandaag';
    if (daysSince === 1) return 'Gisteren';
    return `${daysSince} dagen geleden`;
}

/**
 * Reset the contact form
 */
function resetContactForm() {
    contactForm.reset();
    document.getElementById('contact-id').value = '';
    customFieldsContainer.innerHTML = '';
}

/**
 * Add a custom field to the form
 * @param {Object} [field] - Existing field data (optional)
 */
function addCustomField(field = null) {
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'form-control custom-field-key';
    keyInput.placeholder = 'Naam';
    keyInput.required = true;
    if (field && field.key) {
        keyInput.value = field.key;
    }
    
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'form-control custom-field-value';
    valueInput.placeholder = 'Waarde';
    if (field && field.value) {
        valueInput.value = field.value;
    }
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-outline-danger btn-remove-field';
    removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
    removeBtn.addEventListener('click', function() {
        row.remove();
    });
    
    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);
    
    customFieldsContainer.appendChild(row);
}

/**
 * Save contact data from the form
 */
async function saveContact() {
    // Validate form
    if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
    }
    
    // Get form values
    const contactId = document.getElementById('contact-id').value;
    const name = document.getElementById('contact-name').value;
    const categoryId = document.getElementById('contact-category').value || null;
    const birthday = document.getElementById('contact-birthday').value;
    const frequency = parseInt(document.getElementById('contact-frequency').value);
    const notes = document.getElementById('contact-notes').value;
    const phone = (document.getElementById('contact-phone').value || '').trim();
    const email = (document.getElementById('contact-email').value || '').trim();
    
    // Get custom fields
    const customFields = [];
    const customFieldRows = customFieldsContainer.querySelectorAll('.custom-field-row');
    customFieldRows.forEach(row => {
        const key = row.querySelector('.custom-field-key').value;
        const value = row.querySelector('.custom-field-value').value;
        
        if (key.trim() !== '') {
            customFields.push({ key, value });
        }
    });
    
    try {
        if (isSupabaseConfigured() && currentUser) {
            // Save to Supabase
            const contactData = {
                name,
                category_id: categoryId,
                birthday: birthday || null,
                frequency,
                notes: notes || null,
                phone: phone || null,
                email: email || null,
                custom_fields: customFields,
                user_id: currentUser.id
            };
            
            if (contactId) {
                // Update existing contact
                const { error } = await supabaseClient
                    .from('contacts')
                    .update(contactData)
                    .eq('id', contactId)
                    .eq('user_id', currentUser.id);
                
                if (error) throw error;
                
                // Update in local array
                const index = contactsData.findIndex(c => c.id === contactId);
                if (index !== -1) {
                    contactsData[index] = {
                        ...contactsData[index],
                        name,
                        categoryId,
                        birthday,
                        frequency,
                        notes,
                        phone,
                        email,
                        customFields
                    };
                }
            } else {
                // Create new contact
                const newId = generateUniqueId();
                const { error } = await supabaseClient
                    .from('contacts')
                    .insert({
                        id: newId,
                        ...contactData
                    });
                
                if (error) throw error;
                
                // Add to local array
                const newContact = {
                    id: newId,
                    name,
                    categoryId,
                    birthday,
                    frequency,
                    notes,
                    phone,
                    email,
                    customFields,
                    interactions: []
                };
                
                contactsData.push(newContact);
            }
        } else {
            // Fallback to localStorage
            if (contactId) {
                // Update existing contact
                const index = contactsData.findIndex(c => c.id === contactId);
                if (index !== -1) {
                    const existingContact = contactsData[index];
                    existingContact.name = name;
                    existingContact.categoryId = categoryId;
                    existingContact.birthday = birthday;
                    existingContact.frequency = frequency;
                    existingContact.notes = notes;
                    existingContact.phone = phone;
                    existingContact.email = email;
                    existingContact.customFields = customFields;

                    contactsData[index] = existingContact;
                }
            } else {
                // Create new contact
                const newContact = {
                    id: generateUniqueId(),
                    name,
                    categoryId,
                    birthday,
                    frequency,
                    notes,
                    phone,
                    email,
                    customFields,
                    interactions: []
                };

                contactsData.push(newContact);
            }
            
            saveContactsData();
        }
        
        // Update UI
        renderContacts();
        
        // Close modal
        contactModal.hide();
        
    } catch (error) {
        console.error('Error saving contact:', error);
        alert('Fout bij opslaan van contact: ' + error.message);
    }
}

/**
 * Generate a unique ID for new contacts
 * @returns {string} - Unique ID string
 */
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Show the interaction modal for a contact
 * @param {string} contactId - The contact ID
 * @param {string} [interactionId] - Optional interaction ID for editing
 */
function showInteractionModal(contactId, interactionId = null, prefill = null) {
    // Reset form
    document.getElementById('interaction-form').reset();

    // Helper: today als YYYY-MM-DD string (betrouwbaarder dan valueAsDate)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Gemeenschappelijke standaardwaarden (voor nieuw contactmoment)
    document.getElementById('interaction-contact-id').value = contactId;
    document.getElementById('interaction-id').value = '';
    document.getElementById('interaction-calendar-event-id').value = '';
    document.getElementById('interaction-title').value = '';
    document.getElementById('interaction-date').value = todayStr;
    document.getElementById('interaction-start-time').value = '09:00';
    document.getElementById('interaction-end-time').value = '10:00';
    document.getElementById('interaction-location').value = '';
    document.getElementById('interaction-notes').value = '';
    const availEl = document.getElementById('google-availability');
    availEl.style.display = 'none';
    availEl.textContent = '';

    // Slot-zoeker prefill (Task 12 van de slot-zoeker plan).
    // Alleen bij NIEUWE afspraken (interactionId is null).
    if (!interactionId && prefill) {
        if (prefill.date) document.getElementById('interaction-date').value = prefill.date;
        if (prefill.start_time) document.getElementById('interaction-start-time').value = prefill.start_time;
        if (prefill.end_time) document.getElementById('interaction-end-time').value = prefill.end_time;
        if (prefill.title) {
            const titleEl = document.getElementById('interaction-title');
            if (!titleEl.value) titleEl.value = prefill.title;
        }
    }

    if (interactionId) {
        // ── Bewerkmodus ──────────────────────────────────────────
        const contact = contactsData.find(c => c.id === contactId);
        if (!contact || !contact.interactions) return;

        const interaction = contact.interactions.find(i => i.id === interactionId);
        if (!interaction) return;

        // Normaliseer datum: neem altijd de eerste 10 tekens (YYYY-MM-DD)
        // Supabase date-kolommen worden als "YYYY-MM-DD" teruggegeven,
        // maar soms als "YYYY-MM-DDTHH:mm:ss+00:00" als de kolom een timestamp is.
        const rawDate = interaction.date ? String(interaction.date) : todayStr;
        const interactionDate = rawDate.substring(0, 10);

        document.getElementById('interaction-modal-title').textContent = 'Contact Bewerken';
        deleteInteractionBtn.dataset.contactId = contactId;
        deleteInteractionBtn.dataset.interactionId = interaction.id;
        deleteInteractionBtn.classList.remove('d-none');
        document.getElementById('interaction-id').value = interaction.id;
        document.getElementById('interaction-calendar-event-id').value = interaction.google_calendar_event_id || '';
        document.getElementById('interaction-title').value = interaction.title || '';
        document.getElementById('interaction-start-time').value = interaction.start_time ? String(interaction.start_time).substring(0, 5) : '09:00';
        document.getElementById('interaction-end-time').value = interaction.end_time ? String(interaction.end_time).substring(0, 5) : '10:00';
        document.getElementById('interaction-location').value = interaction.location || '';
        document.getElementById('interaction-type').value = interaction.type || 'in-person';
        document.getElementById('interaction-notes').value = interaction.notes || '';

        // Datum als laatste zetten zodat niets het daarna kan overschrijven
        document.getElementById('interaction-date').value = interactionDate;

        // Beschikbaarheid tonen voor de afspraakdatum
        if (googleAccessToken && interactionDate) {
            checkGoogleAvailability(interactionDate);
        }
    } else {
        // ── Nieuw contactmoment ───────────────────────────────────
        document.getElementById('interaction-modal-title').textContent = 'Contact Vastleggen';
        deleteInteractionBtn.classList.add('d-none');
        delete deleteInteractionBtn.dataset.contactId;
        delete deleteInteractionBtn.dataset.interactionId;
    }

    interactionModal.show();
}

/**
 * Save interaction data from the form
 */
async function saveInteraction() {
    // Guard tegen dubbelklik: als de save-knop al actief is, negeer.
    if (saveInteractionBtn.disabled) return;

    // Validate form
    const interactionForm = document.getElementById('interaction-form');
    if (!interactionForm.checkValidity()) {
        interactionForm.reportValidity();
        return;
    }

    // Vergrendel knop tijdens async-flow (Google Calendar create + Supabase insert).
    saveInteractionBtn.disabled = true;
    const originalBtnText = saveInteractionBtn.textContent;
    saveInteractionBtn.textContent = 'Opslaan…';

    // Get form values
    const contactId = document.getElementById('interaction-contact-id').value;
    const interactionId = document.getElementById('interaction-id').value;
    const existingCalendarEventId = document.getElementById('interaction-calendar-event-id').value;
    const title = document.getElementById('interaction-title').value.trim();
    const date = document.getElementById('interaction-date').value;
    const startTime = document.getElementById('interaction-start-time').value || null;
    const endTime = document.getElementById('interaction-end-time').value || null;
    const location = document.getElementById('interaction-location').value.trim();
    const type = document.getElementById('interaction-type').value;
    const notes = document.getElementById('interaction-notes').value;

    // Afspraak vandaag of later = gepland. Zie isPlannedForDate in lib.js.
    const isPlanned = isPlannedForDate(date);

    // Find contact
    const contactIndex = contactsData.findIndex(c => c.id === contactId);
    if (contactIndex === -1) {
        return;
    }

    try {
        const newInteractionId = interactionId || generateUniqueId();
        const contactName = contactsData[contactIndex].name;

        // Google Calendar sync (ook voor afspraken in het verleden)
        const calendarTitle = title || `Contact: ${contactName}`;
        let calendarEventId = existingCalendarEventId || null;
        if (googleAccessToken) {
            if (calendarEventId) {
                // Update bestaand event
                await updateCalendarEvent(calendarEventId, calendarTitle, date, startTime, endTime, location, notes);
            } else {
                // Nieuw event aanmaken
                calendarEventId = await createCalendarEvent(calendarTitle, date, startTime, endTime, location, notes);
            }
        }

        if (isSupabaseConfigured() && currentUser) {
            // Save to Supabase
            const interactionData = {
                contact_id: contactId,
                user_id: currentUser.id,
                title: title || null,
                date,
                start_time: startTime || null,
                end_time: endTime || null,
                location: location || null,
                type,
                notes: notes || null,
                planned: isPlanned,
                google_calendar_event_id: calendarEventId || null
            };

            if (interactionId) {
                // Update existing interaction
                const { error } = await supabaseClient
                    .from('interactions')
                    .update(interactionData)
                    .eq('id', interactionId)
                    .eq('user_id', currentUser.id);

                if (error) throw error;

                // Update in local array
                if (!contactsData[contactIndex].interactions) {
                    contactsData[contactIndex].interactions = [];
                }
                const interactionIndex = contactsData[contactIndex].interactions.findIndex(i => i.id === interactionId);
                if (interactionIndex !== -1) {
                    contactsData[contactIndex].interactions[interactionIndex] = {
                        id: interactionId,
                        title: title || null,
                        date,
                        start_time: startTime || null,
                        end_time: endTime || null,
                        location: location || null,
                        type,
                        notes,
                        planned: isPlanned,
                        google_calendar_event_id: calendarEventId || null
                    };
                }
            } else {
                // Create new interaction
                const { error } = await supabaseClient
                    .from('interactions')
                    .insert({
                        id: newInteractionId,
                        ...interactionData
                    });

                if (error) throw error;

                // Add to local array
                if (!contactsData[contactIndex].interactions) {
                    contactsData[contactIndex].interactions = [];
                }
                contactsData[contactIndex].interactions.push({
                    id: newInteractionId,
                    title: title || null,
                    date,
                    start_time: startTime || null,
                    end_time: endTime || null,
                    location: location || null,
                    type,
                    notes,
                    planned: isPlanned,
                    google_calendar_event_id: calendarEventId || null
                });
            }
        } else {
            // Fallback to localStorage
            const interaction = {
                id: newInteractionId,
                title: title || null,
                date,
                start_time: startTime || null,
                end_time: endTime || null,
                location: location || null,
                type,
                notes,
                planned: isPlanned,
                google_calendar_event_id: calendarEventId || null
            };

            if (!contactsData[contactIndex].interactions) {
                contactsData[contactIndex].interactions = [];
            }

            if (interactionId) {
                // Update existing interaction
                const interactionIndex = contactsData[contactIndex].interactions.findIndex(i => i.id === interactionId);
                if (interactionIndex !== -1) {
                    contactsData[contactIndex].interactions[interactionIndex] = interaction;
                }
            } else {
                // Add new interaction
                contactsData[contactIndex].interactions.push(interaction);
            }

            saveContactsData();
        }
        
        // Update UI
        renderContacts();
        
        // Close modal
        interactionModal.hide();
        
        // If details modal is open, refresh it
        if (document.getElementById('details-modal').classList.contains('show')) {
            showContactDetails(contactId);
        }
        
    } catch (error) {
        console.error('Error saving interaction:', error);
        alert('Fout bij opslaan van interactie: ' + error.message);
    } finally {
        saveInteractionBtn.disabled = false;
        saveInteractionBtn.textContent = originalBtnText;
    }
}

// State voor pagineerbare historie in de details-modal.
let detailsHistoryLimit = 5;
const HISTORY_PAGE_SIZE = 5;

const INTERACTION_ICONS = {
    'in-person': '👤',
    'video':     '🎥',
    'phone':     '📞',
    'message':   '💬',
    'email':     '📧',
    'other':     '✨'
};

function interactionIcon(interaction) {
    if (interaction.planned) return '📅';
    return INTERACTION_ICONS[interaction.type] || '·';
}

function renderDetailsHistory(contact, container) {
    const today = startOfDay(new Date());
    const interactions = (contact.interactions || []).slice();

    // Toekomstige geplande eerst (asc), daarna alle andere (desc op datum)
    const future = interactions
        .filter(i => i.planned && parseLocalDate(i.date) >= today)
        .sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));
    const rest = interactions
        .filter(i => !(i.planned && parseLocalDate(i.date) >= today))
        .sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date));
    const ordered = future.concat(rest);
    const total = ordered.length;

    container.innerHTML = '';

    if (total === 0) {
        const empty = document.createElement('p');
        empty.className = 'small text-muted mb-0';
        empty.textContent = 'Nog geen contactmomenten.';
        container.appendChild(empty);
        return;
    }

    const limit = Math.min(detailsHistoryLimit, total);
    for (let idx = 0; idx < limit; idx++) {
        const interaction = ordered[idx];
        const isFuture = interaction.planned && parseLocalDate(interaction.date) >= today;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-item';
        const typeLabel = typeof getInteractionTypeLabel === 'function'
            ? getInteractionTypeLabel(interaction.type)
            : interaction.type;
        const notes = interaction.notes ? ` · ${interaction.notes}` : '';
        btn.innerHTML = `
            <span class="history-icon ${isFuture ? 'upcoming' : ''}">${interactionIcon(interaction)}</span>
            <span class="history-body">
                <span class="history-date">${escapeHtml(formatDate(interaction.date))}${isFuture ? '<span class="history-badge-upcoming">gepland</span>' : ''}</span>
                <span class="history-detail">${escapeHtml(typeLabel + notes)}</span>
            </span>
            <span class="history-chevron">›</span>
        `;
        btn.addEventListener('click', () => {
            detailsModal.hide();
            setTimeout(() => showInteractionModal(contact.id, interaction.id), 300);
        });
        container.appendChild(btn);
    }

    const remaining = total - limit;
    if (remaining > 0) {
        const loadMore = document.createElement('button');
        loadMore.type = 'button';
        loadMore.className = 'history-load-more';
        const step = Math.min(HISTORY_PAGE_SIZE, remaining);
        loadMore.textContent = `Toon ${step} eerdere momenten (${remaining} meer)`;
        loadMore.addEventListener('click', () => {
            detailsHistoryLimit += HISTORY_PAGE_SIZE;
            renderDetailsHistory(contact, container);
        });
        container.appendChild(loadMore);
    }
}

/**
 * Show contact details in modal
 * @param {string} contactId - The contact ID
 */
function showContactDetails(contactId) {
    const contact = contactsData.find(c => c.id === contactId);
    if (!contact) return;

    const today = startOfDay(new Date());
    const dtl = computeDagenTeLaat(contact, today);
    const bucket = computeBucket(contact, today);
    const flagCls = rightLabelClass(bucket);
    let flagText;
    if (bucket === BUCKETS.AFSPRAAK_STAAT_AL) {
        const next = getNextFuturePlannedInteraction(contact);
        flagText = next ? `Afspraak ${formatPlannedDateShort(next.date)}` : 'Afspraak gepland';
    } else if (bucket === BUCKETS.NOOIT_CONTACT) {
        flagText = 'Nog geen contact';
    } else if (bucket === BUCKETS.OP_SCHEMA) {
        flagText = 'Op schema';
    } else {
        flagText = formatUrgencyLabel(dtl);
    }

    const category = contact.categoryId ? getCategoryById(contact.categoryId) : null;
    const categoryText = category ? category.name : '';
    const freq = contact.frequency || 30;
    const catLine = categoryText ? `${categoryText} · elke ${freq} dagen` : `Elke ${freq} dagen`;

    const phone = getContactPhone(contact);
    const email = getContactEmail(contact);
    const attempt = getRecentAttempt(attemptsForContact(contact.id));
    const attemptLabel = formatAttemptLabel(attempt, new Date());

    const extraFields = (contact.customFields || []).filter(field => {
        if (!field || !field.key) return false;
        if (PHONE_KEY_PATTERNS.some(p => p.test(field.key))) return false;
        if (EMAIL_KEY_PATTERNS.some(p => p.test(field.key))) return false;
        return true;
    });

    const body = document.getElementById('details-modal-body');
    body.innerHTML = `
        <div class="details-top">
            ${renderAvatarHtml(contact, 'lg')}
            <div>
                <div class="modal-name">${escapeHtml(contact.name)}</div>
                <div class="modal-cat">${escapeHtml(catLine)}</div>
            </div>
        </div>

        <span class="details-flag ${flagCls}">${escapeHtml(flagText)}</span>

        <div>
            ${phone ? `<div class="details-info-row"><span class="info-label">Telefoon</span><span class="info-value"><a href="tel:${escapeHtml(phone.replace(/\s+/g, ''))}">${escapeHtml(phone)}</a></span></div>` : ''}
            ${email ? `<div class="details-info-row"><span class="info-label">E-mail</span><span class="info-value"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></span></div>` : ''}
            ${contact.birthday ? `<div class="details-info-row"><span class="info-label">Geboortedatum</span><span class="info-value">${escapeHtml(formatDate(contact.birthday))}</span></div>` : ''}
            ${contact.notes ? `<div class="details-info-row"><span class="info-label">Notities</span><span class="info-value">${escapeHtml(contact.notes)}</span></div>` : ''}
            ${extraFields.map(f => `<div class="details-info-row"><span class="info-label">${escapeHtml(f.key)}</span><span class="info-value">${escapeHtml(f.value || '')}</span></div>`).join('')}
        </div>

        ${attemptLabel ? `<div class="details-attempt-line">${escapeHtml(attemptLabel)}</div>` : ''}

        <div class="details-action-block">
            <div class="details-action-label">Contact opnemen</div>
            <div class="details-reach-row">
                <button type="button" data-action="bellen" class="${phone ? '' : 'is-disabled'}">Bellen</button>
                <button type="button" data-action="whatsapp" class="${phone ? '' : 'is-disabled'}">WhatsApp</button>
                <button type="button" data-action="mail" class="${email ? '' : 'is-disabled'}">Mail</button>
            </div>
            <div class="missing-info" style="display: none;"></div>
            <button type="button" class="details-primary-btn" data-action="plan">Nu afspraak maken</button>
        </div>

        <div class="history-section">
            <div class="history-header">
                <span class="history-title">Contactgeschiedenis</span>
                <span class="history-count" id="details-history-count"></span>
            </div>
            <div id="details-history-list"></div>
        </div>

        <div class="details-footer-row">
            <button type="button" data-action="edit">Bewerken</button>
            <button type="button" data-action="log">Vastleggen</button>
        </div>
    `;

    // Reset paginering + render historie
    detailsHistoryLimit = HISTORY_PAGE_SIZE;
    const totalHistoryCount = (contact.interactions || []).length;
    const historyCountEl = body.querySelector('#details-history-count');
    if (historyCountEl) {
        historyCountEl.textContent = totalHistoryCount === 1
            ? '1 moment'
            : `${totalHistoryCount} momenten`;
    }
    renderDetailsHistory(contact, body.querySelector('#details-history-list'));

    // Handlers
    const bellenBtn = body.querySelector('[data-action="bellen"]');
    const wappBtn = body.querySelector('[data-action="whatsapp"]');
    const mailBtn = body.querySelector('[data-action="mail"]');
    const planBtn = body.querySelector('[data-action="plan"]');
    const editBtn = body.querySelector('[data-action="edit"]');
    const logBtn = body.querySelector('[data-action="log"]');

    const missingInfoDetails = body.querySelector('.missing-info');
    bellenBtn.addEventListener('click', () => {
        if (phone) handleReach(contact, 'bellen');
        else showMissingInfo(missingInfoDetails, contact, 'phone');
    });
    wappBtn.addEventListener('click', () => {
        if (phone) handleReach(contact, 'whatsapp');
        else showMissingInfo(missingInfoDetails, contact, 'phone');
    });
    mailBtn.addEventListener('click', () => {
        if (email) handleReach(contact, 'mail');
        else showMissingInfo(missingInfoDetails, contact, 'email');
    });
    planBtn.addEventListener('click', () => {
        detailsModal.hide();
        setTimeout(() => openNewInteraction(contact.id), 300);
    });
    editBtn.addEventListener('click', () => {
        detailsModal.hide();
        setTimeout(() => editContact(contact.id), 300);
    });
    logBtn.addEventListener('click', () => {
        detailsModal.hide();
        setTimeout(() => openNewInteraction(contact.id), 300);
    });

    detailsModal.show();
}

/**
 * Calculate days until a specific date
 * @param {string} dateString - ISO date string
 * @returns {number} - Days until date
 */
function calculateDaysUntilDate(dateString) {
    const parts = dateString.split('-');
    const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate - today;
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────
// Google Calendar integratie
// ─────────────────────────────────────────────

/**
 * Update de Google Calendar knop-UI naar "Gekoppeld" of "Ontkoppeld"
 */
function setGoogleCalendarUI(connected) {
    const btn = document.getElementById('google-calendar-btn');
    const status = document.getElementById('google-calendar-status');
    if (connected) {
        status.textContent = 'Gekoppeld ✓';
        btn.classList.remove('btn-outline-light');
        btn.classList.add('btn-success');
    } else {
        status.textContent = 'Google Calendar';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-outline-light');
    }
}

/**
 * Start Google OAuth flow (expliciete klik van gebruiker)
 * Toestemming wordt 60 dagen opgeslagen; daarna stille hernieuwing zonder popup.
 */
function connectGoogleCalendar(onSuccess, onFailure) {
    if (typeof google === 'undefined' || !google.accounts) {
        alert('Google Identity Services zijn nog niet geladen. Probeer het opnieuw.');
        if (typeof onFailure === 'function') onFailure();
        return;
    }
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error('Google OAuth fout:', response.error);
                if (typeof onFailure === 'function') onFailure();
                return;
            }
            googleAccessToken = response.access_token;
            // Guard tegen silent-refresh-loop: markeer dat we net verbonden zijn.
            // initGoogleCalendarSilently skipt binnen 60 sec na deze flag.
            sessionStorage.setItem('google_recent_connect', String(Date.now()));
            // Sla toestemming op voor 60 dagen
            localStorage.setItem('google_consent_granted', String(Date.now() + GOOGLE_CONSENT_EXPIRY_MS));
            // Markeer dat deze browser ooit verbonden is geweest — daarna
            // vraagt de app bij nieuwe afspraken om opnieuw te verbinden
            // als de token weg is. Gebruikers die dit nooit klikken worden
            // ook nooit geprompt.
            localStorage.setItem('google_calendar_ever_connected', 'true');
            setGoogleCalendarUI(true);
            // Sla gekozen account op als login_hint voor stille verlenging
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` }
            })
            .then(r => r.json())
            .then(info => { if (info.email) localStorage.setItem('google_login_hint', info.email); })
            .catch(() => {});
            if (typeof onSuccess === 'function') onSuccess();
        }
    });
    // Bij expliciete klik altijd account-selectie tonen
    googleTokenClient.requestAccessToken({ prompt: 'select_account' });
}

/**
 * Stille token-vernieuwing bij pagina-load als toestemming nog geldig is.
 * Geen popup — de gebruiker merkt hier niets van.
 */
function initGoogleCalendarSilently() {
    // Guard: net verbonden via explicit connect? Skip silent-refresh om loop te
    // voorkomen (op iOS private mode kan redirect-based OAuth een tab-reload
    // triggeren die anders silent-refresh direct weer aftrapt).
    const recent = sessionStorage.getItem('google_recent_connect');
    if (recent && Date.now() - parseInt(recent, 10) < 60_000) return;

    // Token al in memory? Geen refresh nodig.
    if (googleAccessToken) return;

    const stored = localStorage.getItem('google_consent_granted');
    if (!stored) return;
    const expiry = parseInt(stored, 10);
    if (Date.now() >= expiry) {
        localStorage.removeItem('google_consent_granted');
        return;
    }

    // GIS nog niet klaar? Probeer opnieuw na korte vertraging
    if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(initGoogleCalendarSilently, 800);
        return;
    }

    const loginHint = localStorage.getItem('google_login_hint') || '';
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        hint: loginHint,          // vertelt Google welk account te gebruiken
        callback: (response) => {
            if (!response.error) {
                googleAccessToken = response.access_token;
                localStorage.setItem('google_calendar_ever_connected', 'true');
                setGoogleCalendarUI(true);
            }
            // Stille mislukking: geen melding, knop blijft op "Google Calendar"
        },
        error_callback: () => {}
    });
    // prompt: '' + hint = volledig stille verlenging zonder popup
    googleTokenClient.requestAccessToken({ prompt: '' });
}

// --- Multi-calendar helpers -----------------------------------------------
// In-memory cache voor calendar-preferences. Gepopuleerd door
// loadCalendarPrefs(), bijgewerkt door saveCalendarPref(), gereset door
// disconnectGoogleCalendar() en logout.
let calendarPrefsCache = null;

// Haal de lijst calendars op waar user toegang tot heeft.
// Retourneert array van {id, summary, accessRole, primary}.
// Filtert hidden en deleted eruit.
async function fetchCalendarList() {
    if (!googleAccessToken) return [];
    try {
        const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        if (res.status === 401) googleAccessToken = null;
        if (!res.ok) return [];
        const data = await res.json();
        return (data.items || [])
            .filter(cal => !cal.hidden && !cal.deleted)
            .map(cal => ({
                id: cal.id,
                summary: cal.summaryOverride || cal.summary,
                accessRole: cal.accessRole,
                primary: !!cal.primary
            }));
    } catch (err) {
        console.warn('fetchCalendarList faalde:', err);
        return [];
    }
}

// Retourneert array van {calendar_id, mode, calendar_summary}.
// Eerste call: fetcht uit Supabase; daarna in-memory cache.
async function loadCalendarPrefs() {
    if (calendarPrefsCache !== null) return calendarPrefsCache;
    if (!isSupabaseConfigured() || !currentUser) {
        calendarPrefsCache = [];
        return calendarPrefsCache;
    }
    const { data, error } = await supabaseClient
        .from('user_calendar_preferences')
        .select('calendar_id, mode, calendar_summary')
        .eq('user_id', currentUser.id);
    if (error) {
        console.warn('loadCalendarPrefs faalde:', error);
        calendarPrefsCache = [];
        return calendarPrefsCache;
    }
    calendarPrefsCache = data || [];
    return calendarPrefsCache;
}

// Upsert (mode = 'blocking' | 'view-only') of delete (mode = null) van een pref-rij.
// Werkt ook de in-memory cache bij zodat volgende getConfiguredCalendars() vers is.
async function saveCalendarPref(calendarId, mode, calendarSummary) {
    if (!isSupabaseConfigured() || !currentUser) return;
    if (mode === null) {
        const { error } = await supabaseClient
            .from('user_calendar_preferences')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('calendar_id', calendarId);
        if (error) { console.warn('saveCalendarPref delete faalde:', error); return; }
        if (calendarPrefsCache) {
            calendarPrefsCache = calendarPrefsCache.filter(p => p.calendar_id !== calendarId);
        }
    } else {
        const { error } = await supabaseClient
            .from('user_calendar_preferences')
            .upsert({
                user_id: currentUser.id,
                calendar_id: calendarId,
                mode,
                calendar_summary: calendarSummary
            });
        if (error) { console.warn('saveCalendarPref upsert faalde:', error); return; }
        if (calendarPrefsCache) {
            const idx = calendarPrefsCache.findIndex(p => p.calendar_id === calendarId);
            const row = { calendar_id: calendarId, mode, calendar_summary: calendarSummary };
            if (idx >= 0) calendarPrefsCache[idx] = row; else calendarPrefsCache.push(row);
        }
    }
}

// Retourneert de calendars die actief zijn voor read-operations (blocking of view-only).
// Sync — leest uit cache. Roep loadCalendarPrefs() aan voor eerste populatie.
// Fallback bij lege prefs: [{calendarId:'primary', mode:'blocking'}] — matcht oud gedrag.
function getConfiguredCalendars() {
    const prefs = calendarPrefsCache || [];
    if (prefs.length === 0) {
        return [{ calendarId: 'primary', mode: 'blocking', calendarSummary: null }];
    }
    return prefs.map(p => ({
        calendarId: p.calendar_id,
        mode: p.mode,
        calendarSummary: p.calendar_summary
    }));
}

// Wrapper voor ontkoppelen. Er was nog geen dedicated disconnect-functie;
// centraliseert het + reset prefs-cache + wist ever-connected flag.
function disconnectGoogleCalendar() {
    googleAccessToken = null;
    calendarPrefsCache = null;
    localStorage.removeItem('google_calendar_ever_connected');
    setGoogleCalendarUI(false);
}

let calendarSettingsModal = null;

// Opent de Google Calendar-instellingen modal. Alleen aangeroepen als
// googleAccessToken truthy is; menu-handler kiest zelf.
async function openCalendarSettingsModal() {
    const el = document.getElementById('calendar-settings-modal');
    if (!el) return;
    if (!calendarSettingsModal) calendarSettingsModal = new bootstrap.Modal(el);

    const body = document.getElementById('calendar-settings-body');
    body.innerHTML = '<p class="text-muted">Kalenders laden…</p>';
    calendarSettingsModal.show();

    const [calendarList] = await Promise.all([
        fetchCalendarList(),
        loadCalendarPrefs()
    ]);

    if (calendarList.length === 0) {
        body.innerHTML = '<p class="text-danger">Kan kalenderlijst niet ophalen. Verbinding vernieuwen?</p>';
        return;
    }

    // Bij eerste-keer opening: pas defaults toe voor calendars zonder pref.
    // Owner/writer → blocking; rest blijft ongeschreven (= negeren).
    const prefs = calendarPrefsCache || [];
    const prefsMap = new Map(prefs.map(p => [p.calendar_id, p]));
    for (const cal of calendarList) {
        if (!prefsMap.has(cal.id)) {
            if (cal.accessRole === 'owner' || cal.accessRole === 'writer') {
                await saveCalendarPref(cal.id, 'blocking', cal.summary);
            }
        }
    }

    renderCalendarSettingsRows(body, calendarList);
}

function renderCalendarSettingsRows(body, calendarList) {
    const prefs = calendarPrefsCache || [];
    const prefsMap = new Map(prefs.map(p => [p.calendar_id, p.mode]));
    const email = currentUser ? currentUser.email || '' : '';

    const header = `
        <div class="calendar-settings-status">
            <div><b>✓ Verbonden</b>${email ? ` als ${escapeHtml(email)}` : ''}</div>
            <a href="#" data-action="disconnect">Ontkoppelen</a>
        </div>
        <h6 class="mt-3 mb-2 text-muted">Jouw kalenders</h6>
    `;

    const rows = calendarList.map(cal => {
        const currentMode = prefsMap.get(cal.id) || '';
        return `
            <div class="calendar-settings-row">
                <div class="flex-grow-1 min-w-0">
                    <div class="cal-name">${escapeHtml(cal.summary)}${cal.primary ? ' <span class="badge bg-secondary">primary</span>' : ''}</div>
                    <div class="cal-sub text-muted small">${escapeHtml(cal.id)}</div>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <select class="form-select form-select-sm" data-calendar-id="${escapeHtml(cal.id)}" data-summary="${escapeHtml(cal.summary)}">
                        <option value="" ${currentMode === '' ? 'selected' : ''}>Negeren</option>
                        <option value="blocking" ${currentMode === 'blocking' ? 'selected' : ''}>🚫 Blokkeert slots</option>
                        <option value="view-only" ${currentMode === 'view-only' ? 'selected' : ''}>👁 Alleen tonen</option>
                    </select>
                    <span class="save-indicator" aria-live="polite"></span>
                </div>
            </div>
        `;
    }).join('');

    body.innerHTML = header + rows;

    body.querySelectorAll('select[data-calendar-id]').forEach(sel => {
        sel.addEventListener('change', async () => {
            const calId = sel.dataset.calendarId;
            const summary = sel.dataset.summary;
            const val = sel.value;
            const indicator = sel.parentElement.querySelector('.save-indicator');
            indicator.textContent = '⟳';
            indicator.classList.add('visible', 'saving');
            await saveCalendarPref(calId, val === '' ? null : val, summary);
            indicator.textContent = '✓';
            indicator.classList.remove('saving');
            setTimeout(() => {
                indicator.classList.remove('visible');
            }, 1500);
        });
    });

    body.querySelector('[data-action="disconnect"]').addEventListener('click', (e) => {
        e.preventDefault();
        disconnectGoogleCalendar();
        if (calendarSettingsModal) calendarSettingsModal.hide();
    });
}

// --- Instellingen: weekmail-abonnement ---------------------------------
//
// De weekmail is opt-in. Geen rij in `user_settings` betekent niet
// geabonneerd — dezelfde default die de Edge Function aanhoudt. Zet de
// gebruiker de mail aan, dan schrijven we een rij.

let userSettingsModal = null;
let userSettingsCache = null;

// Leest de eigen rij en geeft `{ ok, data }` terug.
//
// Het onderscheid is essentieel: `{ ok: true, data: null }` betekent "geen
// rij, dus niet geabonneerd", maar `{ ok: false }` betekent "we weten het
// niet". Die twee samenvoegen zou een geabonneerde gebruiker bij een
// leesfout "weekmail staat uit" voorschotelen — waarna hij de week erop
// toch mail krijgt. Dan is de UI een leugen.
//
// Geen read-cache: de modal gaat zelden open en een verse lezing voorkomt
// dat een wijziging in een ander tabblad hier verouderd blijft staan.
async function loadUserSettings() {
    if (!isSupabaseConfigured() || !currentUser) return { ok: false, data: null };
    try {
        const { data, error } = await supabaseClient
            .from('user_settings')
            .select('digest_enabled, digest_dag')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        if (error) {
            console.warn('loadUserSettings faalde:', error);
            return { ok: false, data: null };
        }
        userSettingsCache = data || null;
        return { ok: true, data: userSettingsCache };
    } catch (err) {
        console.warn('loadUserSettings gooide:', err);
        return { ok: false, data: null };
    }
}

// Upsert van de eigen rij. Retourneert true bij succes zodat de UI
// onderscheid kan maken tussen opgeslagen en mislukt.
//
// try/catch omdat supabase-js bij een netwerk- of abort-fout de promise
// rejecteert in plaats van een `error`-object te vullen. Zonder catch blijft
// de spinner draaien en verdwijnt de fout in een unhandled rejection.
async function saveUserSettings(digestEnabled, digestDag) {
    if (!isSupabaseConfigured() || !currentUser) return false;
    const row = {
        user_id: currentUser.id,
        digest_enabled: digestEnabled,
        digest_dag: digestDag,
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await supabaseClient.from('user_settings').upsert(row);
        if (error) {
            console.warn('saveUserSettings faalde:', error);
            return false;
        }
    } catch (err) {
        console.warn('saveUserSettings gooide:', err);
        return false;
    }
    userSettingsCache = { digest_enabled: digestEnabled, digest_dag: digestDag };
    return true;
}

async function openUserSettingsModal() {
    const el = document.getElementById('user-settings-modal');
    if (!el) return;
    if (!userSettingsModal) userSettingsModal = new bootstrap.Modal(el);

    const body = document.getElementById('user-settings-body');
    body.innerHTML = '<p class="text-muted">Instellingen laden…</p>';
    userSettingsModal.show();

    if (!isSupabaseConfigured() || !currentUser) {
        body.innerHTML = '<p class="text-danger">Log in om je instellingen te beheren.</p>';
        return;
    }

    const result = await loadUserSettings();
    if (!result.ok) {
        // Niet het formulier tonen: een uitgeschakelde toggle zou hier
        // "je bent niet geabonneerd" beweren terwijl we het niet weten.
        body.innerHTML = `
            <p class="text-danger mb-2">Je instellingen konden niet worden geladen.</p>
            <p class="text-muted small mb-3">
                Je huidige keuze is ongewijzigd — er is niets aangepast.
                Probeer het opnieuw of herlaad de pagina.
            </p>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="user-settings-retry">Opnieuw proberen</button>
        `;
        body.querySelector('#user-settings-retry')
            .addEventListener('click', () => openUserSettingsModal());
        return;
    }
    renderUserSettingsBody(body, result.data);
}

function renderUserSettingsBody(body, settings) {
    const enabled = settings ? settings.digest_enabled === true : false;
    // Geen rij → toon de kolom-default (maandag) als voorselectie.
    const dag = settings && settings.digest_dag !== null && settings.digest_dag !== undefined
        ? Number(settings.digest_dag)
        : 1;

    const dagOpties = DIGEST_DAG_NAMEN.map((naam, i) => {
        const label = naam.charAt(0).toUpperCase() + naam.slice(1);
        return `<option value="${i}" ${i === dag ? 'selected' : ''}>${label}</option>`;
    }).join('');

    body.innerHTML = `
        <h6 class="mb-2">Wekelijkse herinneringsmail</h6>
        <p class="text-muted small mb-3">
            Een overzicht van contacten waar je te lang geen contact mee hebt gehad.
            Je krijgt alleen mail als er daadwerkelijk contacten open staan.
        </p>
        <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" role="switch"
                   id="digest-enabled-toggle" ${enabled ? 'checked' : ''}>
            <label class="form-check-label" for="digest-enabled-toggle">Weekmail ontvangen</label>
            <span class="save-indicator" aria-hidden="true"></span>
        </div>
        <div class="mb-1" id="digest-dag-wrap" style="${enabled ? '' : 'display:none;'}">
            <label for="digest-dag-select" class="form-label small">Op welke dag?</label>
            <select class="form-select form-select-sm" id="digest-dag-select" style="max-width:12rem;">
                ${dagOpties}
            </select>
        </div>
        <!-- Het vinkje zelf is decoratief; screenreaders lezen deze regel.
             Een aria-live met alleen "✓" is betekenisloos. -->
        <p class="visually-hidden" id="user-settings-status" role="status" aria-live="polite"></p>
        <p class="text-muted small mb-0 mt-3">
            Mail gaat naar ${escapeHtml(currentUser.email || 'je account-adres')}.
        </p>
    `;

    const toggle = body.querySelector('#digest-enabled-toggle');
    const select = body.querySelector('#digest-dag-select');
    const wrap = body.querySelector('#digest-dag-wrap');
    const indicator = body.querySelector('.save-indicator');
    const status = body.querySelector('#user-settings-status');

    // Laatst bekende serverwaarde. Wordt het rollback-doel als een save
    // faalt. `settings` kan null zijn (geen rij) — dan is "uit, maandag"
    // de waarheid op de server, precies wat we willen terugzetten.
    let laatstBekend = {
        digest_enabled: enabled,
        digest_dag: dag
    };

    async function persist() {
        indicator.textContent = '⟳';
        indicator.classList.add('visible', 'saving');
        indicator.classList.remove('failed');
        const gewenst = { digest_enabled: toggle.checked, digest_dag: Number(select.value) };
        const ok = await saveUserSettings(gewenst.digest_enabled, gewenst.digest_dag);
        indicator.classList.remove('saving');
        indicator.textContent = ok ? '✓' : '✕';
        indicator.classList.toggle('failed', !ok);

        if (!ok) {
            // Mislukt opslaan mag niet als gelukt overkomen. Draai ALLE
            // controls terug, niet alleen de schakelaar: anders blijft de
            // dropdown een dag tonen die nooit is opgeslagen.
            toggle.checked = laatstBekend.digest_enabled === true;
            select.value = String(laatstBekend.digest_dag);
            wrap.style.display = toggle.checked ? '' : 'none';
            indicator.classList.add('visible');
            status.textContent = 'Opslaan mislukt. Je oude instelling staat er nog.';
            return;
        }

        laatstBekend = gewenst;
        status.textContent = gewenst.digest_enabled
            ? `Opgeslagen. Weekmail staat aan, op ${digestDagNaam(gewenst.digest_dag) || 'maandag'}.`
            : 'Opgeslagen. Weekmail staat uit.';
        setTimeout(() => indicator.classList.remove('visible'), 1500);
    }

    toggle.addEventListener('change', () => {
        wrap.style.display = toggle.checked ? '' : 'none';
        persist();
    });
    select.addEventListener('change', persist);
}

/**
 * Haal bezette tijdsloten op voor een datum via FreeBusy API
 * @param {string} dateStr - Datum in YYYY-MM-DD formaat
 */
async function checkGoogleAvailability(dateStr) {
    const availEl = document.getElementById('google-availability');
    availEl.style.display = 'block';
    availEl.innerHTML = '<span class="text-muted"><i class="bi bi-hourglass-split"></i> Agenda ophalen...</span>';

    try {
        const timeMin = encodeURIComponent(new Date(dateStr + 'T00:00:00').toISOString());
        const timeMax = encodeURIComponent(new Date(dateStr + 'T23:59:59').toISOString());

        // Multi-calendar: loop over configured calendars in plaats van hardcoded primary.
        // Tag events per calendar met isViewOnly + calendarSummary voor consistente rendering.
        await loadCalendarPrefs();
        const configuredCals = getConfiguredCalendars();
        const perCalendarResponses = await Promise.all(configuredCals.map(async (cal) => {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
            try {
                const r = await fetch(url, { headers: { Authorization: `Bearer ${googleAccessToken}` } });
                if (r.status === 401) throw new Error('HTTP 401');
                if (r.status === 404 || !r.ok) return [];
                const d = await r.json();
                const isView = cal.mode !== 'blocking';
                return (d.items || []).map(ev => ({ ev, isViewOnly: isView, calendarSummary: cal.calendarSummary }));
            } catch (err) {
                if (err.message === 'HTTP 401') throw err;
                return [];
            }
        }));
        const tagged = perCalendarResponses.flat().filter(x => x.ev.status !== 'cancelled');

        // Splits all-day en timed, dedupe timed op event-id, sorteer.
        const allDay = tagged.filter(x => x.ev.start.date && !x.ev.start.dateTime);
        const timedSeen = new Set();
        const timed = tagged
            .filter(x => x.ev.start.dateTime)
            .filter(x => {
                if (timedSeen.has(x.ev.id)) return false;
                timedSeen.add(x.ev.id);
                return true;
            })
            .sort((a, b) => new Date(a.ev.start.dateTime) - new Date(b.ev.start.dateTime));

        if (allDay.length === 0 && timed.length === 0) {
            availEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Niets gepland die dag</span>';
        } else {
            const fmt = (iso) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
            const allDayRows = allDay.map(x => {
                const isView = x.isViewOnly;
                const title = x.ev.summary || '(geen titel)';
                const cls = 'wizard-agenda-row allday' + (isView ? ' view-only' : '');
                return `<div class="${cls}"><span class="time">Hele dag</span><span class="title">${escapeHtml(title)}</span></div>`;
            }).join('');
            const timedRows = timed.map(x => {
                const isView = x.isViewOnly;
                const rawTitle = x.ev.summary || '(geen titel)';
                const title = isView && x.calendarSummary ? `${x.calendarSummary}: ${rawTitle}` : rawTitle;
                const cls = 'wizard-agenda-row' + (isView ? ' view-only' : '');
                return `<div class="${cls}"><span class="time">${fmt(x.ev.start.dateTime)}–${fmt(x.ev.end.dateTime)}</span><span class="title">${escapeHtml(title)}</span></div>`;
            }).join('');
            availEl.innerHTML = `<div class="border rounded p-2 bg-white mt-1">${allDayRows}${timedRows}</div>`;
        }
    } catch (err) {
        if (err.message.includes('401')) {
            googleAccessToken = null;
            availEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> Sessie verlopen – koppel Google Calendar opnieuw</span>';
        } else {
            availEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> Kan agenda niet ophalen</span>';
        }
    }
}

// Haal alle events op voor een datum-blok 07:00-23:00 lokale tijd.
// Retourneert een array van {start:'HH:MM', end:'HH:MM', title} voor
// timed events en {allDay:true, title} voor all-day events.
// All-day events tellen alleen als informatie in de mini-view; ze
// blokkeren geen slot-detectie (dat gebeurt in vindVrijeSlot).
// Filtert wel declined events uit.
async function listCalendarEventsForDay(dateStr) {
    if (!googleAccessToken) return [];

    // RFC3339 met lokale timezone-offset. new Date(...).toISOString() zou
    // naar UTC converteren en dan een verkeerd dag-venster geven.
    function localRfc3339(dateStr, hhmm) {
        const [y, mo, d] = dateStr.split('-').map(Number);
        const [h, mi] = hhmm.split(':').map(Number);
        const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
        const tzOffsetMin = -dt.getTimezoneOffset();
        const sign = tzOffsetMin >= 0 ? '+' : '-';
        const abs = Math.abs(tzOffsetMin);
        const oh = String(Math.floor(abs / 60)).padStart(2, '0');
        const om = String(abs % 60).padStart(2, '0');
        const pad = (n) => String(n).padStart(2, '0');
        return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00${sign}${oh}:${om}`;
    }

    const timeMin = encodeURIComponent(localRfc3339(dateStr, '07:00'));
    const timeMax = encodeURIComponent(localRfc3339(dateStr, '23:00'));

    // Multi-calendar: loop over configured calendars. Bij eerste call ook
    // prefs uit Supabase laden (in-memory cache erna). Fallback bij lege
    // prefs is [{calendarId:'primary', mode:'blocking'}] — matcht oud gedrag.
    await loadCalendarPrefs();
    const configuredCals = getConfiguredCalendars();

    const perCalendarResults = await Promise.all(configuredCals.map(async (cal) => {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
            if (res.status === 401) { googleAccessToken = null; return []; }
            if (res.status === 404) return []; // verdwenen calendar — stil skippen
            if (!res.ok) return [];
            const data = await res.json();
            const items = data.items || [];
            const isBlocking = cal.mode === 'blocking';
            return items
                .filter(ev => {
                    if (ev.status === 'cancelled') return false;
                    if (!ev.start) return false;
                    if (ev.attendees && ev.attendees.some(a => a.self && a.responseStatus === 'declined')) return false;
                    // Transparent timed events (persoonlijke "vrij"-blokken) filteren.
                    // Transparent all-day (bijv. verjaardagen) mag blijven — puur info.
                    if (ev.start.dateTime && ev.transparency === 'transparent') return false;
                    return true;
                })
                .map(ev => {
                    const meta = {
                        calendarId: cal.calendarId,
                        calendarSummary: cal.calendarSummary,
                        isBlocking,
                        isViewOnly: !isBlocking
                    };
                    if (!ev.start.dateTime) {
                        return { ...meta, allDay: true, title: ev.summary || '(geen titel)' };
                    }
                    const s = new Date(ev.start.dateTime);
                    const e = new Date(ev.end.dateTime);
                    const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                    return { ...meta, id: ev.id, start: fmt(s), end: fmt(e), title: ev.summary || '(geen titel)' };
                });
        } catch (err) {
            console.warn(`listCalendarEventsForDay faalde voor ${cal.calendarId}:`, err);
            return [];
        }
    }));

    // Flatten, dedupe op event-id (alleen timed events hebben id), sorteer.
    const flat = perCalendarResults.flat();
    const seen = new Set();
    const deduped = flat.filter(e => {
        if (!e.id) return true;
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
    });
    return deduped.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        if (a.allDay && b.allDay) return 0;
        return a.start.localeCompare(b.start);
    });
}

/**
 * Bouw de start/end objecten voor een Google Calendar event
 */
function buildCalendarTimes(date, startTime, endTime) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (startTime) {
        // Zorg dat endTime altijd na startTime valt; standaard +1 uur
        const endT = endTime || (function() {
            const [h, m] = startTime.split(':').map(Number);
            return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        })();
        return {
            start: { dateTime: `${date}T${startTime}:00`, timeZone: tz },
            end:   { dateTime: `${date}T${endT}:00`,      timeZone: tz }
        };
    }
    return { start: { date }, end: { date } };
}

/**
 * Maak een Google Calendar event aan voor een geplande interactie
 * @returns {string|null} Google Calendar event ID
 */
async function createCalendarEvent(calendarTitle, date, startTime, endTime, location, notes) {
    if (!googleAccessToken) return null;
    try {
        const times = buildCalendarTimes(date, startTime, endTime);
        const body = {
            summary: calendarTitle,
            description: notes || '',
            ...times
        };
        if (location) body.location = location;
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const created = await res.json();
        return created.id;
    } catch (err) {
        console.warn('Google Calendar event aanmaken mislukt:', err.message);
        return null;
    }
}

/**
 * Bijwerken van een bestaand Google Calendar event
 */
async function updateCalendarEvent(eventId, calendarTitle, date, startTime, endTime, location, notes) {
    if (!googleAccessToken || !eventId) return;
    try {
        const times = buildCalendarTimes(date, startTime, endTime);
        const body = {
            summary: calendarTitle,
            description: notes || '',
            ...times
        };
        if (location) body.location = location;
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
        console.warn('Google Calendar event bijwerken mislukt:', err.message);
    }
}

/**
 * Verwijderen van een Google Calendar event
 */
async function deleteCalendarEvent(eventId) {
    if (!googleAccessToken || !eventId) return;
    try {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${googleAccessToken}` }
        });
    } catch (err) {
        console.warn('Google Calendar event verwijderen mislukt:', err.message);
    }
}

// ─────────────────────────────────────────────

/**
 * Delete an interaction
 * @param {string} contactId - The contact ID
 * @param {string} interactionId - The interaction ID
 */
async function deleteInteraction(contactId, interactionId) {
    const contactIndex = contactsData.findIndex(c => c.id === contactId);
    if (contactIndex === -1) return;

    const contact = contactsData[contactIndex];
    if (!contact.interactions) return;

    // Verwijder Google Calendar event indien aanwezig
    const interaction = contact.interactions.find(i => i.id === interactionId);
    if (interaction && interaction.google_calendar_event_id) {
        await deleteCalendarEvent(interaction.google_calendar_event_id);
    }

    try {
        if (isSupabaseConfigured() && currentUser) {
            // Delete from Supabase
            const { error } = await supabaseClient
                .from('interactions')
                .delete()
                .eq('id', interactionId)
                .eq('user_id', currentUser.id);

            if (error) throw error;
        } else {
            // Save to localStorage
            saveContactsData();
        }

        // Remove from local array
        contact.interactions = contact.interactions.filter(i => i.id !== interactionId);
        
        // Update UI
        renderContacts();
        
        // Refresh details modal
        showContactDetails(contactId);
        
    } catch (error) {
        console.error('Error deleting interaction:', error);
        alert('Fout bij verwijderen van interactie: ' + error.message);
    }
}

/**
 * Get a human-readable label for interaction type
 * @param {string} type - The interaction type code
 * @returns {string} - Human-readable label
 */
function getInteractionTypeLabel(type) {
    const types = {
        'in-person': 'Persoonlijk',
        'video': 'Video gesprek',
        'phone': 'Telefoongesprek',
        'message': 'Bericht',
        'email': 'E-mail',
        'other': 'Anders'
    };
    
    return types[type] || 'Contact';
}

/**
 * Edit a contact
 * @param {string} contactId - The contact ID
 */
function editContact(contactId) {
    const contact = contactsData.find(c => c.id === contactId);
    if (!contact) {
        return;
    }
    
    // Set form title
    document.getElementById('modal-title').textContent = 'Contact Bewerken';
    
    // Set form values
    document.getElementById('contact-id').value = contact.id;
    document.getElementById('contact-name').value = contact.name;
    
    // Populate categories and set selected
    populateCategorySelect();
    document.getElementById('contact-category').value = contact.categoryId || '';
    
    document.getElementById('contact-birthday').value = contact.birthday || '';
    document.getElementById('contact-frequency').value = contact.frequency || 30;
    document.getElementById('contact-notes').value = contact.notes || '';

    // Vaste telefoon/email velden. Auto-migreer bij bewerken: als het
    // vaste veld leeg is en een custom field matcht op de sleutel,
    // hijs de waarde naar het vaste veld en verwijder die custom field
    // uit de invoer — bij opslaan is de migratie definitief.
    const remainingCustom = (contact.customFields || []).slice();

    let phoneValue = contact.phone && contact.phone.trim() ? contact.phone.trim() : '';
    if (!phoneValue) {
        const idx = remainingCustom.findIndex(f =>
            f && f.key && f.value && PHONE_KEY_PATTERNS.some(p => p.test(f.key)));
        if (idx !== -1) {
            phoneValue = remainingCustom[idx].value.trim();
            remainingCustom.splice(idx, 1);
        }
    }
    document.getElementById('contact-phone').value = phoneValue;

    let emailValue = contact.email && contact.email.trim() ? contact.email.trim() : '';
    if (!emailValue) {
        const idx = remainingCustom.findIndex(f =>
            f && f.key && f.value && EMAIL_KEY_PATTERNS.some(p => p.test(f.key)));
        if (idx !== -1) {
            emailValue = remainingCustom[idx].value.trim();
            remainingCustom.splice(idx, 1);
        }
    }
    document.getElementById('contact-email').value = emailValue;

    // Clear custom fields en toon alleen wat niet gemigreerd is
    customFieldsContainer.innerHTML = '';
    remainingCustom.forEach(field => addCustomField(field));

    // Show modal
    contactModal.show();
}

/**
 * Delete a contact
 * @param {string} contactId - The contact ID
 */
async function deleteContact(contactId) {
    if (!confirm('Weet je zeker dat je dit contact wilt verwijderen?')) {
        return;
    }
    
    const index = contactsData.findIndex(c => c.id === contactId);
    if (index === -1) return;
    
    try {
        if (isSupabaseConfigured() && currentUser) {
            // Delete from Supabase (interactions will be deleted automatically due to CASCADE)
            const { error } = await supabaseClient
                .from('contacts')
                .delete()
                .eq('id', contactId)
                .eq('user_id', currentUser.id);
            
            if (error) throw error;
        } else {
            // Save to localStorage
            saveContactsData();
        }
        
        // Remove from local array
        contactsData.splice(index, 1);
        
        // Update UI
        renderContacts();
        
    } catch (error) {
        console.error('Error deleting contact:', error);
        alert('Fout bij verwijderen van contact: ' + error.message);
    }
}

/**
 * Initialize browser notifications
 */
function initNotifications() {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
        console.log('Deze browser ondersteunt geen notificaties');
        return;
    }
    
    // Request permission if needed
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        document.addEventListener('click', function askPermission() {
            Notification.requestPermission();
            document.removeEventListener('click', askPermission);
        }, { once: true });
    }
}

/**
 * Check for contacts that are due and show notifications
 */
function checkContactsDue() {
    // Skip if notifications aren't granted
    if (Notification.permission !== 'granted') {
        return;
    }
    
    // Find contacts that are overdue AND have no upcoming planned appointment
    const dueContacts = contactsData.filter(contact => {
        if (getNextFuturePlannedInteraction(contact)) return false;
        return calculateTimePercentage(contact) >= 100;
    });
    
    // Show notifications for due contacts (max 3 at a time)
    dueContacts.slice(0, 3).forEach(contact => {
        const daysOverdue = calculateDaysSinceLastContact(contact) - contact.frequency;
        
        let message;
        if (daysOverdue <= 0) {
            message = `Het is tijd om contact op te nemen met ${contact.name}.`;
        } else {
            message = `Je hebt al ${daysOverdue} dagen geen contact gehad met ${contact.name}.`;
        }
        
        const notification = new Notification('Contact herinnering', {
            body: message,
            icon: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/icons/person-fill.svg'
        });
        
        notification.onclick = function() {
            window.focus();
            showContactDetails(contact.id);
            notification.close();
        };
    });
}

// Set up a daily check for contacts due
setInterval(checkContactsDue, 86400000); // Check once per day (86400000ms = 24h)

/**
 * Export all contacts data to a JSON file
 */
function exportData() {
    if (contactsData.length === 0) {
        alert('Geen data om te exporteren.');
        return;
    }
    
    // Create export object with metadata
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        contacts: contactsData
    };
    
    // Convert to JSON string
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    // Create download link
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contacten-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    alert(`Data geëxporteerd: ${contactsData.length} contact${contactsData.length !== 1 ? 'en' : ''}`);
}

/**
 * Handle import file selection
 * @param {Event} event - File input change event
 */
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Verify file type
    if (!file.name.endsWith('.json')) {
        alert('Selecteer een geldig JSON bestand.');
        importFileInput.value = '';
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Validate data structure
            if (!importedData.contacts || !Array.isArray(importedData.contacts)) {
                throw new Error('Ongeldig data formaat');
            }
            
            // Ask user for confirmation
            const contactCount = importedData.contacts.length;
            const message = `Dit bestand bevat ${contactCount} contact${contactCount !== 1 ? 'en' : ''}.\n\n` +
                          `Wil je deze importeren?\n` +
                          `- "OK" = Toevoegen aan bestaande contacten\n` +
                          `- "Annuleren" = Annuleren`;
            
            if (confirm(message)) {
                // ALWAYS regenerate IDs for imported contacts to ensure uniqueness per user
                const contactsToImport = [];
                importedData.contacts.forEach(contact => {
                    // Generate new unique ID for this contact
                    const newContactId = generateUniqueId();
                    const oldContactId = contact.id;
                    contact.id = newContactId;
                    
                    // Regenerate ALL interaction IDs with new contact reference
                    if (contact.interactions) {
                        contact.interactions.forEach(interaction => {
                            interaction.id = generateUniqueId();
                        });
                    }
                    
                    contactsToImport.push(contact);
                });
                
                if (isSupabaseConfigured() && currentUser) {
                    // Save to Supabase
                    let successCount = 0;
                    let failCount = 0;
                    
                    for (const contact of contactsToImport) {
                        try {
                            // Save contact to Supabase
                            const { error: contactError } = await supabaseClient
                                .from('contacts')
                                .insert({
                                    id: contact.id,
                                    user_id: currentUser.id,
                                    name: contact.name,
                                    birthday: contact.birthday || null,
                                    frequency: contact.frequency || 30,
                                    notes: contact.notes || null,
                                    phone: contact.phone || null,
                                    email: contact.email || null,
                                    custom_fields: contact.customFields || []
                                });

                            if (contactError) throw contactError;
                            
                            // Save interactions if any
                            if (contact.interactions && contact.interactions.length > 0) {
                                const interactions = contact.interactions.map(i => ({
                                    id: i.id,
                                    contact_id: contact.id,
                                    user_id: currentUser.id,
                                    date: i.date,
                                    type: i.type,
                                    notes: i.notes || null,
                                    planned: i.planned || false
                                }));
                                
                                const { error: interactionsError } = await supabaseClient
                                    .from('interactions')
                                    .insert(interactions);
                                
                                if (interactionsError) throw interactionsError;
                            }
                            
                            // Add to local array
                            contactsData.push(contact);
                            successCount++;
                            
                        } catch (error) {
                            console.error(`Failed to import contact ${contact.name}:`, error);
                            failCount++;
                        }
                    }
                    
                    // Update UI
                    renderContacts();
                    
                    if (failCount > 0) {
                        alert(`Import voltooid!\n\nSuccesvol: ${successCount}\nMislukt: ${failCount}`);
                    } else {
                        alert(`${successCount} contact${successCount !== 1 ? 'en' : ''} succesvol geïmporteerd!`);
                    }
                    
                } else {
                    // Fallback to localStorage
                    contactsToImport.forEach(contact => {
                        contactsData.push(contact);
                    });
                    
                    // Save and update UI
                    saveContactsData();
                    renderContacts();
                    
                    alert(`${contactCount} contact${contactCount !== 1 ? 'en' : ''} geïmporteerd!`);
                }
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('Fout bij het importeren van het bestand. Controleer of het bestand geldig is.');
        } finally {
            // Reset file input
            importFileInput.value = '';
        }
    };
    
    reader.onerror = function() {
        alert('Fout bij het lezen van het bestand.');
        importFileInput.value = '';
    };
    
    reader.readAsText(file);
}

/**
 * ======================
 * SUPABASE AUTHENTICATION
 * ======================
 */

/**
 * Initialize authentication system
 */
async function initAuth() {
    if (!isSupabaseConfigured()) {
        console.log('Supabase not configured, using localStorage only');
        return;
    }
    
    // Initialize auth modal
    authModal = new bootstrap.Modal(document.getElementById('auth-modal'));
    
    // Set up auth event listeners
    setupAuthListeners();
    
    // Check for existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        onAuthStateChange(true);
    } else {
        // Show login modal if Supabase is configured
        authModal.show();
    }
    
    // Listen for auth changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            onAuthStateChange(true);
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            onAuthStateChange(false);
        }
    });
}

/**
 * Set up authentication event listeners
 */
function setupAuthListeners() {
    // Login form submit
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });
    
    // Register form submit
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleRegister();
    });
    
    // Logout button
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await handleLogout();
    });
    
    // Forgot password link
    document.getElementById('forgot-password-link').addEventListener('click', async (e) => {
        e.preventDefault();
        await handleForgotPassword();
    });
}

/**
 * Handle user login
 */
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    hideAuthMessages();
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        // Success - modal will be hidden by onAuthStateChange
        showAuthSuccess('Ingelogd!');
        
        // Check for localStorage migration after short delay
        setTimeout(() => checkLocalStorageMigration(), 500);
        
    } catch (error) {
        showAuthError(getAuthErrorMessage(error.message));
    }
}

/**
 * Handle user registration
 */
async function handleRegister() {
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-password-confirm').value;
    
    hideAuthMessages();
    
    // Check if passwords match
    if (password !== confirmPassword) {
        showAuthError('Wachtwoorden komen niet overeen');
        return;
    }
    
    try {
        const { data, error} = await supabaseClient.auth.signUp({
            email,
            password
        });
        
        if (error) throw error;
        
        showAuthSuccess('Account aangemaakt! Je kunt nu inloggen.');
        
        // Switch to login tab
        setTimeout(() => {
            document.getElementById('login-tab').click();
        }, 2000);
        
    } catch (error) {
        showAuthError(getAuthErrorMessage(error.message));
    }
}

/**
 * Handle user logout
 */
async function handleLogout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;

        // Clear local data
        contactsData = [];
        attemptsData = [];
        sessionStorage.removeItem(PHONE_IMPORT_AUTO_KEY);
        renderContacts();

        // Google Calendar ontkoppelen
        googleAccessToken = null;
        googleTokenClient = null;
        localStorage.removeItem('google_consent_granted');
        localStorage.removeItem('google_login_hint');
        setGoogleCalendarUI(false);

        // Show auth modal again
        authModal.show();

    } catch (error) {
        alert('Fout bij uitloggen: ' + error.message);
    }
}

/**
 * Handle forgot password
 */
async function handleForgotPassword() {
    const email = prompt('Voer je e-mailadres in:');
    
    if (!email) return;
    
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });
        
        if (error) throw error;
        
        alert('Er is een wachtwoord reset link naar je e-mail gestuurd.');
        
    } catch (error) {
        alert('Fout: ' + error.message);
    }
}

/**
 * Handle authentication state changes
 */
function onAuthStateChange(isAuthenticated) {
    if (isAuthenticated) {
        // Hide auth modal
        authModal.hide();

        // Show user info
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-info').style.display = 'inline-block';

        // Load user's data from Supabase
        loadDataFromSupabase();

        // Stille Google Calendar-refresh: pas na Contactbeheer-login,
        // zodat een eventuele Google-popup nooit vóór het app-loginscherm verschijnt.
        initGoogleCalendarSilently();

        // Uitschrijflink uit de weekmail: #instellingen opent de modal.
        // Pas hier, niet op DOMContentLoaded — vóór login is `currentUser`
        // leeg en zou de modal "log in om je instellingen te beheren" tonen.
        // De hash wordt daarna gewist zodat een refresh of een tweede
        // auth-event de modal niet opnieuw opent.
        //
        // Alleen deze hash heeft een handler; #vandaag en #contact= uit
        // dezelfde mail hebben er (nog) geen.
        if (window.location.hash === '#instellingen') {
            history.replaceState(null, '', window.location.pathname + window.location.search);
            // Wachten tot de auth-modal echt weg is. Bootstrap haalt
            // `modal-open` van <body> pas aan het eind van zijn
            // hide-transitie; twee modals in dezelfde tick laat een
            // backdrop achter of verliest de scroll-lock. Kwam de gebruiker
            // uitgelogd binnen via de uitschrijflink, dan is dat precies
            // dit pad.
            const authEl = document.getElementById('auth-modal');
            if (authEl && authEl.classList.contains('show')) {
                authEl.addEventListener('hidden.bs.modal', () => openUserSettingsModal(), { once: true });
            } else {
                openUserSettingsModal();
            }
        }

    } else {
        // Clear data on logout
        contactsData = [];
        categoriesData = [];
        sessionStorage.removeItem(PHONE_IMPORT_AUTO_KEY);
        
        // Hide user info
        document.getElementById('user-info').style.display = 'none';
        
        // Show auth modal
        if (authModal) {
            authModal.show();
        }
    }
}

/**
 * Show authentication error message
 */
function showAuthError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * Show authentication success message
 */
function showAuthSuccess(message) {
    const successDiv = document.getElementById('auth-success');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
}

/**
 * Hide authentication messages
 */
function hideAuthMessages() {
    document.getElementById('auth-error').style.display = 'none';
    document.getElementById('auth-success').style.display = 'none';
}

/**
 * Get user-friendly error message
 */
function getAuthErrorMessage(errorMsg) {
    if (errorMsg.includes('Invalid login credentials')) {
        return 'Ongeldig e-mailadres of wachtwoord';
    } else if (errorMsg.includes('Email not confirmed')) {
        return 'E-mail nog niet bevestigd. Controleer je inbox.';
    } else if (errorMsg.includes('User already registered')) {
        return 'Dit e-mailadres is al geregistreerd';
    }
    return errorMsg;
}

/**
 * Check if localStorage has data that needs migration
 */
function checkLocalStorageMigration() {
    const localData = localStorage.getItem('contactsData');
    
    if (localData) {
        try {
            const parsed = JSON.parse(localData);
            if (parsed && parsed.length > 0) {
                // Ask user if they want to migrate
                const message = `Er zijn ${parsed.length} contact${parsed.length !== 1 ? 'en' : ''} gevonden op dit apparaat.\n\n` +
                              `Wil je deze migreren naar je online account?`;
                
                if (confirm(message)) {
                    migrateLocalStorageToSupabase(parsed);
                }
            }
        } catch (error) {
            console.error('Error checking localStorage:', error);
        }
    }
}

/**
 * Migrate localStorage data to Supabase
 */
async function migrateLocalStorageToSupabase(contacts) {
    try {
        console.log(`Starting migration of ${contacts.length} contacts...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const contact of contacts) {
            try {
                // Save contact to Supabase
                const { error: contactError } = await supabaseClient
                    .from('contacts')
                    .insert({
                        id: contact.id,
                        user_id: currentUser.id,
                        name: contact.name,
                        birthday: contact.birthday || null,
                        frequency: contact.frequency || 30,
                        notes: contact.notes || null,
                        phone: contact.phone || null,
                        email: contact.email || null,
                        custom_fields: contact.customFields || []
                    });
                
                if (contactError) throw contactError;
                
                // Migrate interactions
                if (contact.interactions && contact.interactions.length > 0) {
                    const interactions = contact.interactions.map(i => ({
                        id: i.id,
                        contact_id: contact.id,
                        user_id: currentUser.id,
                        date: i.date,
                        type: i.type,
                        notes: i.notes || null,
                        planned: i.planned || false
                    }));
                    
                    const { error: interactionsError } = await supabaseClient
                        .from('interactions')
                        .insert(interactions);
                    
                    if (interactionsError) throw interactionsError;
                }
                
                successCount++;
            } catch (error) {
                console.error(`Failed to migrate contact ${contact.name}:`, error);
                failCount++;
            }
        }
        
        alert(`Migratie voltooid!\n\nSuccesvol: ${successCount}\nMislukt: ${failCount}`);
        
        // Reload data from Supabase
        await loadDataFromSupabase();
        
        // Optional: clear localStorage after successful migration
        if (successCount > 0 && failCount === 0) {
            if (confirm('Migratie succesvol! Wil je de lokale data verwijderen?')) {
                localStorage.removeItem('contactsData');
            }
        }
        
    } catch (error) {
        console.error('Migration error:', error);
        alert('Fout tijdens migratie: ' + error.message);
    }
}

/**
 * Load data from Supabase
 */
async function loadDataFromSupabase() {
    if (!currentUser) return;
    
    try {
        // Load categories
        const { data: categories, error: categoriesError } = await supabaseClient
            .from('categories')
            .select('*')
            .eq('user_id', currentUser.id);
            
        if (categoriesError) {
            console.warn('Could not load categories (table might not exist yet):', categoriesError);
            // Don't throw, just continue with empty categories
            categoriesData = [];
        } else {
            categoriesData = categories;
        }

        // Load contacts
        const { data: contacts, error: contactsError } = await supabaseClient
            .from('contacts')
            .select('*')
            .eq('user_id', currentUser.id);
        
        if (contactsError) throw contactsError;
        
        // Load all interactions
        const { data: interactions, error: interactionsError } = await supabaseClient
            .from('interactions')
            .select('*')
            .eq('user_id', currentUser.id);

        if (interactionsError) throw interactionsError;

        // Load recente pogingen (stap 4: Vandaag-scherm)
        await loadAttemptsFromSupabase();

        // Combine contacts with their interactions
        contactsData = contacts.map(contact => ({
            id: contact.id,
            name: contact.name,
            categoryId: contact.category_id,
            birthday: contact.birthday,
            frequency: contact.frequency,
            notes: contact.notes,
            phone: contact.phone || '',
            email: contact.email || '',
            customFields: contact.custom_fields || [],
            interactions: interactions.filter(i => i.contact_id === contact.id)
        }));
        
        // Populate category filters
        populateCategoryFilters();

        // Render the contacts
        renderContacts();

        // Lege account → onboarding-wizard voor telefoon-import
        maybeAutoOpenPhoneImport();

        console.log(`Loaded ${contactsData.length} contacts and ${categoriesData.length} categories from Supabase`);
        
    } catch (error) {
        console.error('Error loading data from Supabase:', error);
        alert('Fout bij laden van data: ' + error.message);
    }
}

// Initialize auth if Supabase is configured
if (isSupabaseConfigured()) {
    document.addEventListener('DOMContentLoaded', initAuth);
}

/**
 * ======================
 * CATEGORY MANAGEMENT
 * ======================
 */

/**
 * Render the list of categories in the modal
 */
function renderCategoriesList() {
    categoriesList.innerHTML = '';
    
    if (categoriesData.length === 0) {
        categoriesList.innerHTML = '<div class="text-center text-muted py-3 small">Nog geen categorieën</div>';
        return;
    }
    
    categoriesData.forEach(category => {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        item.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <span class="color-dot" style="background-color: ${category.color}"></span>
                <span>${category.name}</span>
            </div>
            <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-primary edit-category-btn" data-id="${category.id}" title="Bewerken">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-category-btn" data-id="${category.id}" title="Verwijderen">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;

        item.querySelector('.edit-category-btn').addEventListener('click', function() {
            openEditCategory(category.id);
        });

        item.querySelector('.delete-category-btn').addEventListener('click', function() {
            deleteCategory(category.id);
        });
        
        categoriesList.appendChild(item);
    });
}

/**
 * Populate the category select dropdown
 */
function populateCategorySelect() {
    contactCategorySelect.innerHTML = '<option value="">Geen categorie</option>';

    categoriesData.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        contactCategorySelect.appendChild(option);
    });
}

/**
 * Populate category filter chips
 */
function populateCategoryFilters() {
    if (!categoryFilters) return;

    const filterBtns = categoryFilters.querySelectorAll('.btn');
    if (filterBtns.length === 1) { // Only "Alles" button exists
        categoriesData.forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm btn-outline-primary';
            btn.dataset.category = category.id;
            btn.textContent = category.name;
            categoryFilters.appendChild(btn);
        });
    }
}

/**
 * Save a new category
 */
async function saveCategory() {
    const nameInput = document.getElementById('category-name');
    const colorInput = document.getElementById('category-color');
    
    const name = nameInput.value.trim();
    const color = colorInput.value;
    
    if (!name) return;
    
    try {
        if (isSupabaseConfigured() && currentUser) {
            // Save to Supabase
            const { data, error } = await supabaseClient
                .from('categories')
                .insert({
                    user_id: currentUser.id,
                    name,
                    color
                })
                .select()
                .single();
            
            if (error) throw error;
            
            categoriesData.push(data);
        } else {
            // Local storage
            const newCategory = {
                id: generateUniqueId(),
                name,
                color
            };
            categoriesData.push(newCategory);
            saveCategoriesData();
        }
        
        // Reset form
        nameInput.value = '';
        
        // Update UI
        renderCategoriesList();
        populateCategorySelect();
        populateCategoryFilters();
        
    } catch (error) {
        console.error('Error saving category:', error);
        alert('Fout bij opslaan categorie: ' + error.message);
    }
}

/**
 * Open edit modal for a category
 * @param {string} id - Category ID
 */
function openEditCategory(id) {
    const category = categoriesData.find(c => c.id === id);
    if (!category) return;

    document.getElementById('edit-category-id').value = id;
    document.getElementById('edit-category-name').value = category.name;
    document.getElementById('edit-category-color').value = category.color;
    document.getElementById('edit-selected-color-preview').style.backgroundColor = category.color;
    document.getElementById('edit-category-preview').style.backgroundColor = category.color;
    document.getElementById('edit-category-preview').textContent = category.name;

    // Zet geselecteerde kleur in grid
    document.getElementById('edit-color-grid').querySelectorAll('.color-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.color === category.color);
    });

    editCategoryModal.show();
}

/**
 * Update an existing category
 */
async function updateCategory() {
    const id = document.getElementById('edit-category-id').value;
    const name = document.getElementById('edit-category-name').value.trim();
    const color = document.getElementById('edit-category-color').value;

    if (!name) {
        alert('Voer een naam in voor de categorie.');
        return;
    }

    try {
        if (isSupabaseConfigured() && currentUser) {
            const { error } = await supabaseClient
                .from('categories')
                .update({ name, color })
                .eq('id', id)
                .eq('user_id', currentUser.id);

            if (error) throw error;
        }

        // Update lokale array
        const idx = categoriesData.findIndex(c => c.id === id);
        if (idx !== -1) {
            categoriesData[idx] = { ...categoriesData[idx], name, color };
        }

        if (!isSupabaseConfigured() || !currentUser) {
            saveCategoriesData();
        }

        editCategoryModal.hide();
        renderCategoriesList();
        populateCategorySelect();
        renderContacts(); // badges bijwerken

    } catch (error) {
        console.error('Error updating category:', error);
        alert('Fout bij bijwerken categorie: ' + error.message);
    }
}

/**
 * Delete a category
 * @param {string} id - Category ID
 */
async function deleteCategory(id) {
    if (!confirm('Weet je zeker dat je deze categorie wilt verwijderen?')) return;
    
    try {
        if (isSupabaseConfigured() && currentUser) {
            const { error } = await supabaseClient
                .from('categories')
                .delete()
                .eq('id', id)
                .eq('user_id', currentUser.id);
            
            if (error) throw error;
        }
        
        // Remove from local array
        categoriesData = categoriesData.filter(c => c.id !== id);
        
        // Update contacts that had this category
        contactsData.forEach(contact => {
            if (contact.categoryId === id) {
                contact.categoryId = null;
            }
        });
        
        if (!isSupabaseConfigured() || !currentUser) {
            saveCategoriesData();
            saveContactsData();
        }
        
        // Update UI
        renderCategoriesList();
        populateCategoryFilters();
        renderContacts(); // Re-render contacts to remove badges
        
    } catch (error) {
        console.error('Error deleting category:', error);
        alert('Fout bij verwijderen categorie: ' + error.message);
    }
}

/**
 * ======================
 * CONTACTEN IMPORTEREN UIT TELEFOON (vCard-wizard)
 * ======================
 */

// Bewerk hier om de export-instructies aan te passen; deploy = git push.
const IMPORT_INSTRUCTIONS = {
    iphone: [
        'Open de <strong>Telefoon</strong>-app.',
        'Tik onderin op <strong>Contacten</strong>.',
        'Tik linksboven op het <strong>pijltje naar links</strong> — je komt nu in de lijsten.',
        'Houd de <strong>lijst</strong> die je wil exporteren <strong>ingedrukt</strong> en tik op <strong>Exporteer</strong>.',
        'Optioneel: kies welke velden je wil delen en vink aan.',
        'Tik op <strong>Sla op in Bestanden</strong> en kies een plek waar je het straks terugvindt.'
    ],
    android: [
        'Ga naar <strong>contacts.google.com</strong> in je browser en log in met je Google-account.',
        'Selecteer linksboven het <strong>vierkantje</strong> naast "Contacten" om alle contacten aan te vinken (of selecteer per stuk).',
        'Klik op het <strong>drie-punten-menu</strong> ⋮ rechtsboven → <strong>Exporteren</strong>.',
        'Kies <strong>vCard (voor iOS-contacten)</strong> als indeling.',
        'Klik op <strong>Exporteren</strong>. Het bestand <code>contacts.vcf</code> wordt gedownload.'
    ],
    vcf: 'Kies het <code>.vcf</code>-bestand dat je al hebt (bijvoorbeeld eerder geëxporteerd of iemand heeft het je gestuurd).',
    hintIphone: 'Werken de stappen niet meer of zijn ze anders bij jouw iOS-versie? Laat het weten — we passen ze aan.',
    // Verwijder deze regel zodra iemand met Android de stappen heeft gevalideerd (zie plan Task 9).
    hintAndroid: 'Werken de stappen niet meer? Laat het weten — we passen ze aan. (Kan verouderd zijn; zie <a href="https://support.google.com/contacts/answer/7199294" target="_blank" rel="noopener">Google-help</a>.)',
    hintVcf: 'Ken je het formaat niet? Ga terug en kies iPhone of Android — dan geven we stap-voor-stap uitleg.'
};

const PHONE_IMPORT_AUTO_KEY = 'phone_import_auto_shown';
const PHONE_IMPORT_STEP_NUMBER = { platform: 1, export: 2, loading: 3, selectie: 4 };

let phoneImportModal = null;
let phoneImportState = null;

function detectImportPlatform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iphone';
    if (/Android/i.test(ua)) return 'android';
    return null;
}

function newPhoneImportState(source) {
    return {
        source,
        step: 'platform',
        suggested: detectImportPlatform(),
        platform: null,
        file: null,
        error: '',
        rows: [],        // [{contact, picked, badge: null|'exists'|'dup'}], alfabetisch
        search: '',
        importing: false,
        skippedNameless: 0
    };
}

/** source: 'auto' (lege account na login) of 'menu'. */
function openPhoneImportWizard(source) {
    const el = document.getElementById('import-phone-wizard-modal');
    if (!el) return;
    if (!phoneImportModal) {
        phoneImportModal = new bootstrap.Modal(el);
        // Cleanup bij sluiten (X/Esc/backdrop/Sla over): geen oude selectie laten staan.
        el.addEventListener('hidden.bs.modal', () => {
            phoneImportState = null;
            document.getElementById('import-phone-wizard-body').innerHTML = '';
            document.getElementById('import-phone-wizard-progress').innerHTML = '';
        });
    }
    phoneImportState = newPhoneImportState(source);
    if (source === 'auto') sessionStorage.setItem(PHONE_IMPORT_AUTO_KEY, '1');
    renderPhoneImport();
    phoneImportModal.show();
}

function renderPhoneImportProgress() {
    const cur = PHONE_IMPORT_STEP_NUMBER[phoneImportState.step];
    const el = document.getElementById('import-phone-wizard-progress');
    el.innerHTML = `Stap ${cur} van 4` + (cur > 1 ? ` · <span class="done">${'✓'.repeat(cur - 1)}</span>` : '');
}

function renderPhoneImport() {
    if (!phoneImportState) return;
    renderPhoneImportProgress();
    const body = document.getElementById('import-phone-wizard-body');
    switch (phoneImportState.step) {
        case 'platform': return renderPhoneImportPlatform(body);
        case 'export': return renderPhoneImportExport(body);
        case 'loading': return renderPhoneImportLoading(body);
        case 'selectie': return renderPhoneImportSelectie(body);
    }
}

function renderPhoneImportPlatform(body) {
    const s = phoneImportState;
    const cards = [
        { id: 'iphone', emoji: '📱', label: 'iPhone' },
        { id: 'android', emoji: '🤖', label: 'Android / Google Contacts' },
        { id: 'vcf', emoji: '📁', label: 'Ik heb al een .vcf-bestand' }
    ];
    body.innerHTML = `
        <h6 class="mb-3">Kies je platform</h6>
        <div class="platform-cards">
            ${cards.map(c => `
                <button type="button" class="platform-card${s.platform === c.id ? ' selected' : ''}${s.suggested === c.id ? ' auto-detected' : ''}"
                        data-platform="${c.id}" aria-pressed="${s.platform === c.id}" aria-label="${escapeHtml(c.label)}">
                    <span class="emoji" aria-hidden="true">${c.emoji}</span>${escapeHtml(c.label)}
                </button>`).join('')}
        </div>
        <div class="d-flex justify-content-between align-items-center mt-4">
            <button type="button" class="btn btn-link px-0" id="pi-skip">Sla over</button>
            <button type="button" class="btn btn-primary" id="pi-next" ${s.platform ? '' : 'disabled'}>Volgende →</button>
        </div>`;
    body.querySelectorAll('.platform-card').forEach(btn => btn.addEventListener('click', () => {
        s.platform = btn.dataset.platform;
        renderPhoneImport();
    }));
    body.querySelector('#pi-skip').addEventListener('click', () => phoneImportModal.hide());
    body.querySelector('#pi-next').addEventListener('click', () => { s.step = 'export'; renderPhoneImport(); });
}

function renderPhoneImportExport(body) {
    const s = phoneImportState;
    let instructions;
    if (s.platform === 'vcf') {
        instructions = `<p>${IMPORT_INSTRUCTIONS.vcf}</p><p class="export-hint">${IMPORT_INSTRUCTIONS.hintVcf}</p>`;
    } else {
        const steps = IMPORT_INSTRUCTIONS[s.platform];
        const hint = s.platform === 'iphone' ? IMPORT_INSTRUCTIONS.hintIphone : IMPORT_INSTRUCTIONS.hintAndroid;
        instructions = `<ol class="export-steps">${steps.map(t => `<li>${t}</li>`).join('')}</ol><p class="export-hint">${hint}</p>`;
    }
    body.innerHTML = `
        <h6 class="mb-3">Exporteer je contacten</h6>
        ${instructions}
        <div class="file-picker mt-3">
            <input type="file" accept=".vcf,text/vcard,text/x-vcard" class="d-none" id="pi-file">
            <button type="button" class="btn btn-outline-primary" id="pi-pick">Kies bestand…</button>
            <span class="ms-2" id="pi-filename">${s.file ? escapeHtml(s.file.name) : ''}</span>
            <div class="error mt-2" id="pi-error" role="alert">${escapeHtml(s.error)}</div>
        </div>
        <div class="d-flex justify-content-between mt-4">
            <button type="button" class="btn btn-outline-secondary" id="pi-back">← Vorige</button>
            <button type="button" class="btn btn-primary" id="pi-next" ${s.file ? '' : 'disabled'}>Volgende →</button>
        </div>`;
    const input = body.querySelector('#pi-file');
    body.querySelector('#pi-pick').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        const f = input.files[0];
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.vcf')) {
            s.file = null;
            s.error = 'Selecteer een .vcf-bestand.';
        } else {
            s.file = f;
            s.error = '';
        }
        renderPhoneImport();
    });
    body.querySelector('#pi-back').addEventListener('click', () => { s.step = 'platform'; s.error = ''; renderPhoneImport(); });
    body.querySelector('#pi-next').addEventListener('click', () => { s.step = 'loading'; renderPhoneImport(); });
}

function renderPhoneImportLoading(body) {
    const s = phoneImportState;
    body.innerHTML = `
        <div class="wizard-loading">
            <div class="spinner-border" role="status" aria-hidden="true"></div>
            <p class="mt-3 mb-0" id="pi-loading-text">Bezig met inlezen…</p>
        </div>
        <div class="text-center d-none" id="pi-load-error">
            <p class="text-danger" role="alert" id="pi-load-error-text"></p>
            <button type="button" class="btn btn-outline-secondary" id="pi-back">← Terug</button>
        </div>`;
    const fail = (msg) => {
        body.querySelector('.wizard-loading').classList.add('d-none');
        body.querySelector('#pi-load-error').classList.remove('d-none');
        body.querySelector('#pi-load-error-text').textContent = msg;
        body.querySelector('#pi-back').addEventListener('click', () => { s.step = 'export'; s.file = null; renderPhoneImport(); });
    };
    const reader = new FileReader();
    reader.onerror = () => { if (phoneImportState === s) fail('Het bestand kon niet gelezen worden.'); };
    reader.onload = () => {
        if (phoneImportState !== s) return; // wizard is intussen gesloten
        try {
            const parsed = parseVCard(String(reader.result));
            const existingNames = new Set(contactsData.map(c => (c.name || '').trim().toLowerCase()));
            const seenNamesInFile = new Set();
            const rows = [];
            let nameless = 0;
            for (const vcard of parsed) {
                let contact;
                try { contact = mapVCardToContact(vcard); } catch (e) { console.warn('vCard-record overgeslagen:', e); continue; }
                if (!contact) { nameless++; continue; }
                const key = contact.name.toLowerCase();
                const badge = existingNames.has(key) ? 'exists' : (seenNamesInFile.has(key) ? 'dup' : null);
                rows.push({ contact, picked: selectDefaultPicked(contact, existingNames, seenNamesInFile), badge });
                seenNamesInFile.add(key);
            }
            s.skippedNameless = nameless;
            if (!rows.length) return fail('Geen contacten gevonden in dit bestand. Is het wel een .vcf-export?');
            rows.sort((a, b) => a.contact.name.localeCompare(b.contact.name, 'nl', { sensitivity: 'base' }));
            s.rows = rows;
            s.search = '';
            body.querySelector('#pi-loading-text').textContent = `${rows.length} contacten gevonden…`;
            setTimeout(() => { if (phoneImportState === s) { s.step = 'selectie'; renderPhoneImport(); } }, 300);
        } catch (e) {
            console.error('vCard parse-fout:', e);
            fail('Dit bestand kon niet gelezen worden. Probeer de export opnieuw.');
        }
    };
    reader.readAsText(s.file);
}

function phoneImportSummary(contact) {
    const parts = [contact.phone, contact.email].filter(Boolean);
    return parts.length ? parts.join(' · ') : '— geen contactgegevens —';
}

function renderPhoneImportSelectie(body) {
    const s = phoneImportState;
    body.innerHTML = `
        <h6 class="mb-3">Kies welke contacten je wil</h6>
        <div class="d-flex gap-2 mb-2">
            <input type="search" class="form-control" id="pi-search" placeholder="Zoek op naam…" aria-label="Zoek op naam" value="${escapeHtml(s.search)}">
            <button type="button" class="btn btn-outline-secondary text-nowrap" id="pi-all-on">Alles aan</button>
            <button type="button" class="btn btn-outline-secondary text-nowrap" id="pi-all-off">Alles uit</button>
        </div>
        <div class="small text-muted mb-2" id="pi-count" aria-live="polite"></div>
        <div class="import-list" id="pi-list"></div>
        <div class="d-flex justify-content-between mt-3">
            <button type="button" class="btn btn-link px-0" id="pi-skip">Sla over</button>
            <button type="button" class="btn btn-primary" id="pi-import"></button>
        </div>`;
    body.querySelector('#pi-search').addEventListener('input', (e) => { s.search = e.target.value; updatePhoneImportList(); });
    body.querySelector('#pi-all-on').addEventListener('click', () => setVisiblePhoneImportPicked(true));
    body.querySelector('#pi-all-off').addEventListener('click', () => setVisiblePhoneImportPicked(false));
    body.querySelector('#pi-skip').addEventListener('click', () => phoneImportModal.hide());
    body.querySelector('#pi-import').addEventListener('click', runPhoneImport);
    updatePhoneImportList();
}

function visiblePhoneImportRows() {
    const q = phoneImportState.search.trim().toLowerCase();
    return phoneImportState.rows.filter(r => !q || r.contact.name.toLowerCase().includes(q));
}

// Filtert alleen zichtbaarheid; r.picked (de centrale selectie) blijft ongemoeid.
function updatePhoneImportList() {
    const s = phoneImportState;
    const list = document.getElementById('pi-list');
    if (!s || !list) return;
    const visible = visiblePhoneImportRows();
    list.innerHTML = visible.length ? visible.map(r => {
        const i = s.rows.indexOf(r);
        const badge = r.badge === 'exists' ? '<span class="exists-badge">al aanwezig</span>'
                    : r.badge === 'dup' ? '<span class="exists-badge">duplicaat in bestand</span>' : '';
        const dimmed = (!r.contact.phone && !r.contact.email) || r.badge;
        return `<label class="contact-row${dimmed ? ' dimmed' : ''}">
            <input type="checkbox" class="form-check-input mt-1" data-i="${i}" ${r.picked ? 'checked' : ''}>
            <span><span class="name">${escapeHtml(r.contact.name)}</span>${badge}<br><span class="summary">${escapeHtml(phoneImportSummary(r.contact))}</span></span>
        </label>`;
    }).join('') : '<div class="p-3 text-muted">Geen contacten gevonden voor deze zoekterm.</div>';
    list.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
        s.rows[+cb.dataset.i].picked = cb.checked;
        updatePhoneImportCounter();
    }));
    updatePhoneImportCounter();
}

function setVisiblePhoneImportPicked(value) {
    // "Alles aan" respecteert badges (bestaand/duplicaat); "Alles uit" wist alles.
    visiblePhoneImportRows().forEach(r => {
        if (value && !shouldIncludeInBulkPickOn(r)) return;
        r.picked = value;
    });
    updatePhoneImportList();
}

// Teller telt over de héle lijst, niet alleen de zichtbare rijen.
function updatePhoneImportCounter() {
    const s = phoneImportState;
    if (!s) return;
    const n = s.rows.filter(r => r.picked).length;
    document.getElementById('pi-count').textContent = `${n} van ${s.rows.length} geselecteerd`;
    const btn = document.getElementById('pi-import');
    btn.textContent = `Importeer ${n} contact${n === 1 ? '' : 'en'}`;
    btn.disabled = n === 0 || s.importing;
}

async function runPhoneImport() {
    const s = phoneImportState;
    if (!s || s.importing) return;
    if (!isSupabaseConfigured() || !currentUser) { alert('Log eerst in om te importeren.'); return; }
    const picked = s.rows.filter(r => r.picked).map(r => r.contact);
    s.importing = true;
    updatePhoneImportCounter();

    let ok = 0, failed = 0, authAbort = false;
    const failedNames = [];
    for (let i = 0; i < picked.length && !authAbort; i += 10) {
        const batch = picked.slice(i, i + 10);
        const results = await Promise.all(batch.map(async (c) => {
            const id = generateUniqueId();
            const { error, status } = await supabaseClient.from('contacts').insert({
                id,
                user_id: currentUser.id,
                name: c.name,
                birthday: c.birthday || null,
                frequency: 30,
                notes: c.notes || null,
                phone: c.phone || null,
                email: c.email || null,
                custom_fields: c.customFields || []
            });
            return { c, id, error: error ? { ...error, status } : null };
        }));
        for (const { c, id, error } of results) {
            if (!error) {
                contactsData.push({
                    id, name: c.name, categoryId: null, birthday: c.birthday, frequency: 30,
                    notes: c.notes, phone: c.phone, email: c.email,
                    customFields: c.customFields, interactions: []
                });
                ok++;
            } else if (isImportAuthError(error)) {
                authAbort = true;
            } else {
                console.error(`Import mislukt voor ${c.name}:`, error);
                failed++;
                failedNames.push(c.name);
            }
        }
    }

    renderContacts();
    if (phoneImportModal) phoneImportModal.hide();
    if (authAbort) {
        alert(`Kan niet importeren — je bent uitgelogd of hebt geen toegang. Log opnieuw in en probeer nogmaals.${ok ? `\n\n${ok} contacten zijn al wel geïmporteerd.` : ''}`);
    } else {
        alert(formatImportSummary({
            imported: ok,
            total: picked.length,
            failed,
            failedNames,
            skippedNameless: s.skippedNameless || 0
        }));
    }
}

function maybeAutoOpenPhoneImport() {
    if (contactsData.length !== 0) return;
    if (sessionStorage.getItem(PHONE_IMPORT_AUTO_KEY)) return;
    // `.modal-backdrop` / `modal-open` blijven staan tot het eind van de hide-transitie
    // (auth-modal vlak na login); `.modal.show` alleen is dan al weg.
    if (document.querySelector('.modal.show, .modal-backdrop') || document.body.classList.contains('modal-open')) {
        // Andere modal nog open of aan het sluiten: opnieuw proberen zodra die dicht is.
        document.addEventListener('hidden.bs.modal', maybeAutoOpenPhoneImport, { once: true });
        return;
    }
    openPhoneImportWizard('auto');
}
