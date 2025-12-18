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
const deleteContactBtn = document.getElementById('delete-contact-btn');
const editContactBtn = document.getElementById('edit-contact-btn');
const exportDataBtn = document.getElementById('export-data-btn');
const importDataBtn = document.getElementById('import-data-btn');
const importFileInput = document.getElementById('import-file-input');
const manageCategoriesBtn = document.getElementById('manage-categories-btn');
const categoryForm = document.getElementById('category-form');
const categoriesList = document.getElementById('categories-list');
const contactCategorySelect = document.getElementById('contact-category');

// Bootstrap Modal instances
let contactModal;
let interactionModal;
let detailsModal;
let authModal;
let categoriesModal;

// Current user
let currentUser = null;

// Current sort method
let currentSortMethod = 'urgency';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap modals
    contactModal = new bootstrap.Modal(document.getElementById('contact-modal'));
    interactionModal = new bootstrap.Modal(document.getElementById('interaction-modal'));
    detailsModal = new bootstrap.Modal(document.getElementById('details-modal'));
    categoriesModal = new bootstrap.Modal(document.getElementById('categories-modal'));
    
    // Load data from localStorage
    loadContactsData();
    loadCategoriesData();
    
    // Render contacts
    renderContacts();
    
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
    
    // Delete contact button
    deleteContactBtn.addEventListener('click', function() {
        const contactId = this.getAttribute('data-id');
        deleteContact(contactId);
        detailsModal.hide();
    });
    
    // Edit contact button
    editContactBtn.addEventListener('click', function() {
        const contactId = this.getAttribute('data-id');
        editContact(contactId);
        detailsModal.hide();
    });
    
    // Current date for interaction modal
    document.getElementById('interaction-modal').addEventListener('show.bs.modal', function() {
        document.getElementById('interaction-date').valueAsDate = new Date();
    });
    
    // Export data button
    exportDataBtn.addEventListener('click', exportData);
    
    // Import data button
    importDataBtn.addEventListener('click', function() {
        importFileInput.click();
    });
    
    // Import file input change
    importFileInput.addEventListener('change', handleImportFile);
    
    // Sort contacts dropdown
    const sortSelect = document.getElementById('sort-contacts');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            currentSortMethod = this.value;
            renderContacts();
        });
    }
}

/**
 * Render all contacts in the UI
 */
function renderContacts() {
    // Clear existing contacts
    contactsContainer.innerHTML = '';
    
    // Show or hide no contacts message
    if (contactsData.length === 0) {
        noContactsMessage.style.display = 'block';
        return;
    } else {
        noContactsMessage.style.display = 'none';
    }
    
    // Sort contacts based on current method
    if (currentSortMethod === 'planned') {
        contactsData.sort((a, b) => {
            // Check for future planned interactions
            const aPlanned = getNextFuturePlannedInteraction(a);
            const bPlanned = getNextFuturePlannedInteraction(b);
            
            // If both have planned interactions, sort by date (earliest first)
            if (aPlanned && bPlanned) {
                return new Date(aPlanned.date) - new Date(bPlanned.date);
            }
            
            // If only a has planned interaction, it comes first
            if (aPlanned) return -1;
            
            // If only b has planned interaction, it comes first
            if (bPlanned) return 1;
            
            // If neither has planned interaction, sort by urgency (default fallback)
            const aPercentage = calculateTimePercentage(a);
            const bPercentage = calculateTimePercentage(b);
            return bPercentage - aPercentage;
        });
    } else {
        // Default: Sort by urgency (those who need contact soonest first)
        contactsData.sort((a, b) => {
            const aPercentage = calculateTimePercentage(a);
            const bPercentage = calculateTimePercentage(b);
            return bPercentage - aPercentage;
        });
    }
    
    // Create and append contact cards
    contactsData.forEach(contact => {
        const contactCard = createContactCard(contact);
        contactsContainer.appendChild(contactCard);
    });
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
function createContactCard(contact) {
    const col = document.createElement('div');
    col.className = 'col-md-4 col-lg-3 fade-in';
    
    // Check for upcoming planned interactions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const plannedInteractions = contact.interactions ? contact.interactions.filter(i => {
        if (!i.planned) return false;
        const date = new Date(i.date);
        return date >= today;
    }) : [];
    
    const hasPlannedInteraction = plannedInteractions.length > 0;
    
    let nextPlannedInteraction;
    let daysUntilPlanned;
    let plannedPercentage;
    
    if (hasPlannedInteraction) {
        // Sort by date (earliest first)
        plannedInteractions.sort((a, b) => new Date(a.date) - new Date(b.date));
        nextPlannedInteraction = plannedInteractions[0];
        daysUntilPlanned = calculateDaysUntilDate(nextPlannedInteraction.date);
        
        // Calculate percentage for progress bar (closer to date = higher percentage)
        const plannedDate = new Date(nextPlannedInteraction.date);
        const originalDateSet = new Date(plannedDate);
        originalDateSet.setDate(originalDateSet.getDate() - 30); // Assume planned 30 days in advance
        
        const totalDays = (plannedDate - originalDateSet) / (1000 * 60 * 60 * 24);
        const daysElapsed = (today - originalDateSet) / (1000 * 60 * 60 * 24);
        plannedPercentage = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
    }
    
    // Calculate regular contact timing and status (for non-planned interactions)
    const daysSinceLastContact = calculateDaysSinceLastContact(contact);
    const contactFrequency = contact.frequency || 30; // Default to 30 days if not set
    const percentage = calculateTimePercentage(contact);
    const contactStatus = getContactStatus(percentage);
    
    // Get category info
    const category = contact.categoryId ? getCategoryById(contact.categoryId) : null;
    const categoryColor = category ? category.color : 'transparent';
    const categoryName = category ? category.name : '';

    // Create card HTML structure
    const cardHtml = `
        <div class="card contact-card" style="${category ? `border-top: 5px solid ${categoryColor};` : ''}">
            <div class="card-header d-flex justify-content-between align-items-center bg-white">
                <h5 class="contact-name m-0">${contact.name}</h5>
                <button class="btn btn-sm btn-outline-primary action-btn view-details-btn" data-id="${contact.id}">
                    <i class="bi bi-eye"></i>
                </button>
            </div>
            <div class="card-body">
                ${category ? `<span class="badge mb-2" style="background-color: ${categoryColor}">${categoryName}</span>` : ''}
                <div class="contact-info">
                <div class="contact-info">
                    ${contact.birthday ? `<p><i class="bi bi-calendar-heart"></i> ${formatDate(contact.birthday)}</p>` : ''}
                    
                    <span class="last-contact">
                        ${contact.interactions && contact.interactions.length > 0 
                            ? `<i class="bi bi-clock-history"></i> Laatste contact: ${formatLastContactDate(contact)}`
                            : '<i class="bi bi-exclamation-circle"></i> Nog geen contact gehad'}
                    </span>
                    
                    <span class="contact-frequency">
                        <i class="bi bi-arrow-repeat"></i> Gewenst: elke ${contactFrequency} dagen
                    </span>
                    
                    ${hasPlannedInteraction ? `
                    <div class="progress-container mt-2">
                        <div class="timer-indicator">
                            <span class="timer-text">
                                <i class="bi bi-calendar-check"></i> Afspraak: ${formatDaysUntilLabel(daysUntilPlanned)}
                            </span>
                            <span class="timer-text">${Math.floor(plannedPercentage)}%</span>
                        </div>
                        <div class="progress">
                            <div class="progress-bar bg-primary" 
                                role="progressbar" 
                                style="width: ${plannedPercentage}%" 
                                aria-valuenow="${plannedPercentage}" 
                                aria-valuemin="0" 
                                aria-valuemax="100"></div>
                        </div>
                    </div>
                    ` : `
                    <div class="progress-container">
                        <div class="timer-indicator">
                            <span class="timer-text">Contact over: ${calculateDaysRemaining(contact)} dagen</span>
                            <span class="timer-text">${Math.floor(percentage)}%</span>
                        </div>
                        <div class="progress">
                            <div class="progress-bar status-${contactStatus}" 
                                role="progressbar" 
                                style="width: ${percentage}%" 
                                aria-valuenow="${percentage}" 
                                aria-valuemin="0" 
                                aria-valuemax="100"></div>
                        </div>
                    </div>
                    `}
                </div>
                
                <div class="card-actions mt-3 d-flex justify-content-between">
                    <button class="btn btn-sm btn-success action-btn log-interaction-btn" data-id="${contact.id}">
                        <i class="bi bi-plus-circle"></i>
                    </button>
                    <button class="btn btn-sm btn-primary action-btn edit-btn" data-id="${contact.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                </div>
            </div>
            ${isContactDue(contact) ? '<div class="notification-dot"></div>' : ''}
        </div>
    `;
    
    col.innerHTML = cardHtml;
    
    // Add event listeners for card buttons
    col.querySelector('.view-details-btn').addEventListener('click', function() {
        showContactDetails(contact.id);
    });
    
    col.querySelector('.log-interaction-btn').addEventListener('click', function() {
        showInteractionModal(contact.id);
    });
    
    col.querySelector('.edit-btn').addEventListener('click', function() {
        editContact(contact.id);
    });
    
    return col;
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
    
    // Find the most recent interaction date
    // Parse dates as local time to avoid timezone issues
    const dates = contact.interactions.map(interaction => {
        const parts = interaction.date.split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]);
    });
    const mostRecentDate = new Date(Math.max.apply(null, dates));
    
    // Calculate days difference
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    
    const diffTime = today - mostRecentDate;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
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
 * Format last contact date with relative time
 * @param {Object} contact - The contact data
 * @returns {string} - Formatted date string
 */
function formatLastContactDate(contact) {
    if (!contact.interactions || contact.interactions.length === 0) {
        return 'Nooit';
    }
    
    const dates = contact.interactions.map(interaction => new Date(interaction.date));
    const mostRecentDate = new Date(Math.max.apply(null, dates));
    
    const daysSince = calculateDaysSinceLastContact(contact);
    
    if (daysSince === 0) {
        return 'Vandaag';
    } else if (daysSince === 1) {
        return 'Gisteren';
    } else {
        return `${daysSince} dagen geleden`;
    }
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
function showInteractionModal(contactId, interactionId = null) {
    // Reset form
    document.getElementById('interaction-form').reset();
    document.getElementById('interaction-contact-id').value = contactId;
    document.getElementById('interaction-id').value = '';
    document.getElementById('interaction-date').valueAsDate = new Date();
    document.getElementById('interaction-notes').value = '';
    
    // Update title
    document.getElementById('interaction-modal-title').textContent = 'Contact Vastleggen';
    
    // If editing an existing interaction
    if (interactionId) {
        const contact = contactsData.find(c => c.id === contactId);
        if (!contact || !contact.interactions) return;
        
        const interaction = contact.interactions.find(i => i.id === interactionId);
        if (!interaction) return;
        
        // Set form values
        document.getElementById('interaction-id').value = interaction.id;
        document.getElementById('interaction-date').value = interaction.date;
        document.getElementById('interaction-type').value = interaction.type;
        document.getElementById('interaction-notes').value = interaction.notes || '';
        
        // Update title
        document.getElementById('interaction-modal-title').textContent = 'Contact Bewerken';
    }
    
    interactionModal.show();
}

/**
 * Save interaction data from the form
 */
async function saveInteraction() {
    // Validate form
    const interactionForm = document.getElementById('interaction-form');
    if (!interactionForm.checkValidity()) {
        interactionForm.reportValidity();
        return;
    }
    
    // Get form values
    const contactId = document.getElementById('interaction-contact-id').value;
    const interactionId = document.getElementById('interaction-id').value;
    const date = document.getElementById('interaction-date').value;
    const type = document.getElementById('interaction-type').value;
    const notes = document.getElementById('interaction-notes').value;
    
    // Determine if planned based on date (Future = Planned, Today/Past = History)
    const dateParts = date.split('-');
    const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const isPlanned = selectedDate > today;
    
    // Find contact
    const contactIndex = contactsData.findIndex(c => c.id === contactId);
    if (contactIndex === -1) {
        return;
    }
    
    try {
        const newInteractionId = interactionId || generateUniqueId();
        
        if (isSupabaseConfigured() && currentUser) {
            // Save to Supabase
            const interactionData = {
                contact_id: contactId,
                user_id: currentUser.id,
                date,
                type,
                notes: notes || null,
                planned: isPlanned
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
                        date,
                        type,
                        notes,
                        planned: isPlanned
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
                    date,
                    type,
                    notes,
                    planned: isPlanned
                });
            }
        } else {
            // Fallback to localStorage
            const interaction = {
                id: newInteractionId,
                date,
                type,
                notes,
                planned: isPlanned
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
    }
}

/**
 * Show contact details in modal
 * @param {string} contactId - The contact ID
 */
function showContactDetails(contactId) {
    const contact = contactsData.find(c => c.id === contactId);
    if (!contact) return;
    
    // Update modal title
    document.getElementById('details-name').textContent = contact.name;
    
    // Set button attributes
    document.getElementById('delete-contact-btn').setAttribute('data-id', contact.id);
    document.getElementById('edit-contact-btn').setAttribute('data-id', contact.id);
    
    // Setup add interaction button
    const addInteractionBtn = document.getElementById('add-interaction-btn');
    // Clone to remove old event listeners
    const newAddBtn = addInteractionBtn.cloneNode(true);
    addInteractionBtn.parentNode.replaceChild(newAddBtn, addInteractionBtn);
    
    newAddBtn.addEventListener('click', function() {
        detailsModal.hide();
        setTimeout(() => {
            showInteractionModal(contactId);
        }, 500);
    });
    
    const infoContainer = document.getElementById('details-info');
    let infoHtml = '';
    
    if (contact.birthday) {
        infoHtml += `<p><strong>Geboortedatum:</strong> ${formatDate(contact.birthday)}</p>`;
    }
    
    infoHtml += `<p><strong>Contact frequentie:</strong> Elke ${contact.frequency || 30} dagen</p>`;
    
    if (contact.notes) {
        infoHtml += `<p><strong>Notities:</strong> ${contact.notes}</p>`;
    }
    
    // Add custom fields
    if (contact.customFields && contact.customFields.length > 0) {
        infoHtml += '<div class="mt-3 mb-3"><strong>Extra informatie:</strong>';
        infoHtml += '<ul class="list-group">';
        
        contact.customFields.forEach(field => {
            infoHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
                <span>${field.key}</span>
                <span class="text-secondary">${field.value}</span>
            </li>`;
        });
        
        infoHtml += '</ul></div>';
    }
    
    // Find upcoming planned interactions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const plannedInteractions = contact.interactions ? contact.interactions.filter(i => {
        if (!i.planned) return false;
        const date = new Date(i.date);
        return date >= today;
    }) : [];
    
    if (plannedInteractions.length > 0) {
        // Sort by date (earliest first)
        plannedInteractions.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Get next planned interaction
        const nextPlannedInteraction = plannedInteractions[0];
        const daysUntilPlanned = calculateDaysUntilDate(nextPlannedInteraction.date);
        
        // Calculate percentage for progress bar (closer to date = higher percentage)
        const plannedDate = new Date(nextPlannedInteraction.date);
        const originalDateSet = new Date(plannedDate);
        originalDateSet.setDate(originalDateSet.getDate() - 30); // Assume planned 30 days in advance
        
        const totalDays = (plannedDate - originalDateSet) / (1000 * 60 * 60 * 24);
        const daysElapsed = (today - originalDateSet) / (1000 * 60 * 60 * 24);
        const plannedPercentage = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
        
        infoHtml += '<div class="alert alert-primary mt-3">';
        infoHtml += `<p><strong>Geplande afspraak:</strong> ${formatDate(nextPlannedInteraction.date)} (${formatDaysUntilLabel(daysUntilPlanned)})</p>`;
        infoHtml += `<p><strong>Type:</strong> ${getInteractionTypeLabel(nextPlannedInteraction.type)}</p>`;
        
        infoHtml += `<div class="progress mt-2">
            <div class="progress-bar bg-primary" 
                role="progressbar" 
                style="width: ${plannedPercentage}%" 
                aria-valuenow="${plannedPercentage}" 
                aria-valuemin="0" 
                aria-valuemax="100"></div>
        </div>`;
        
        infoHtml += '</div>';
    }
    
    // Add contact stats for past interactions
    const daysSinceLastContact = calculateDaysSinceLastContact(contact);
    const daysRemaining = calculateDaysRemaining(contact);
    const percentage = calculateTimePercentage(contact);
    
    infoHtml += '<div class="alert alert-info mt-3">';
    
    if (daysSinceLastContact === Infinity) {
        infoHtml += '<p><strong>Status:</strong> Nog geen contact gehad</p>';
    } else {
        infoHtml += `<p><strong>Laatste contact:</strong> ${formatLastContactDate(contact)}</p>`;
        infoHtml += `<p><strong>Volgend contact:</strong> ${daysRemaining === 0 ? 'Nu' : `Over ${daysRemaining} dagen`}</p>`;
    }
    
    infoHtml += `<div class="progress mt-2">
        <div class="progress-bar status-${getContactStatus(percentage)}" 
            role="progressbar" 
            style="width: ${percentage}%" 
            aria-valuenow="${percentage}" 
            aria-valuemin="0" 
            aria-valuemax="100"></div>
    </div>`;
    
    infoHtml += '</div>';
    
    infoContainer.innerHTML = infoHtml;
    
    // Build interaction history
    const historyContainer = document.getElementById('interaction-history');
    let historyHtml = '';
    
    if (!contact.interactions || contact.interactions.length === 0) {
        historyHtml = '<p class="text-center text-muted">Geen interacties gevonden</p>';
    } else {
        // Create separate sections for planned and past interactions
        // Note: 'today' and 'plannedInteractions' are already defined in the outer scope
        
        // Past interactions: planned=false OR (planned=true AND date < today)
        const pastInteractions = contact.interactions.filter(i => {
            if (!i.planned) return true;
            const parts = i.date.split('-');
            const date = new Date(parts[0], parts[1] - 1, parts[2]);
            return date < today;
        });
        
        // Add planned interactions section if any exist
        if (plannedInteractions.length > 0) {
            historyHtml += '<h5 class="mt-3 mb-3">Geplande afspraken</h5>';
            
            // Sort by date (earliest first)
            plannedInteractions.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            plannedInteractions.forEach(interaction => {
                const daysUntil = calculateDaysUntilDate(interaction.date);
                
                historyHtml += `<div class="interaction-item" data-id="${interaction.id}">
                    <div class="interaction-header d-flex justify-content-between">
                        <span class="interaction-date">
                            ${formatDate(interaction.date)} 
                            <span class="badge bg-primary ms-2">${formatDaysUntilLabel(daysUntil)}</span>
                        </span>
                        <div>
                            <span class="interaction-type">
                                ${getInteractionTypeLabel(interaction.type)}
                                <span class="interaction-type-pill">${interaction.type}</span>
                            </span>
                            <div class="btn-group btn-group-sm ms-2">
                                <button type="button" class="btn btn-outline-primary edit-interaction-btn" data-id="${interaction.id}">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button type="button" class="btn btn-outline-danger delete-interaction-btn" data-id="${interaction.id}">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    ${interaction.notes ? `<div class="interaction-notes mt-2">${interaction.notes}</div>` : ''}
                </div>`;
            });
        }
        
        // Add past interactions section if any exist
        if (pastInteractions.length > 0) {
            historyHtml += '<h5 class="mt-4 mb-3">Vorige contactmomenten</h5>';
            
            // Sort by date (newest first)
            pastInteractions.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            pastInteractions.forEach(interaction => {
                historyHtml += `<div class="interaction-item" data-id="${interaction.id}">
                    <div class="interaction-header d-flex justify-content-between">
                        <span class="interaction-date">${formatDate(interaction.date)}</span>
                        <div>
                            <span class="interaction-type">
                                ${getInteractionTypeLabel(interaction.type)}
                                <span class="interaction-type-pill">${interaction.type}</span>
                            </span>
                            <div class="btn-group btn-group-sm ms-2">
                                <button type="button" class="btn btn-outline-primary edit-interaction-btn" data-id="${interaction.id}">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button type="button" class="btn btn-outline-danger delete-interaction-btn" data-id="${interaction.id}">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    ${interaction.notes ? `<div class="interaction-notes mt-2">${interaction.notes}</div>` : ''}
                </div>`;
            });
        }
    }
    
    historyContainer.innerHTML = historyHtml;
    
    // Add event listeners for interaction edit and delete buttons
    const editButtons = historyContainer.querySelectorAll('.edit-interaction-btn');
    const deleteButtons = historyContainer.querySelectorAll('.delete-interaction-btn');
    
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const interactionId = this.getAttribute('data-id');
            
            // Close details modal first to prevent z-index issues
            detailsModal.hide();
            
            // Wait for modal to close, then open interaction modal
            setTimeout(function() {
                showInteractionModal(contactId, interactionId);
            }, 300); // Bootstrap modal transition time
        });
    });
    
    deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const interactionId = this.getAttribute('data-id');
            deleteInteraction(contactId, interactionId);
        });
    });
    
    // Show modal
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

/**
 * Delete an interaction
 * @param {string} contactId - The contact ID
 * @param {string} interactionId - The interaction ID
 */
async function deleteInteraction(contactId, interactionId) {
    if (!confirm('Weet je zeker dat je deze interactie wilt verwijderen?')) {
        return;
    }
    
    const contactIndex = contactsData.findIndex(c => c.id === contactId);
    if (contactIndex === -1) return;
    
    const contact = contactsData[contactIndex];
    if (!contact.interactions) return;
    
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
    
    // Clear custom fields
    customFieldsContainer.innerHTML = '';
    
    // Add custom fields if any
    if (contact.customFields && contact.customFields.length > 0) {
        contact.customFields.forEach(field => {
            addCustomField(field);
        });
    }
    
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
    
    // Find contacts that are due
    const dueContacts = contactsData.filter(contact => isContactDue(contact));
    
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
        renderContacts();
        
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
        
    } else {
        // Clear data on logout
        contactsData = [];
        categoriesData = [];
        
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
        
        // Combine contacts with their interactions
        contactsData = contacts.map(contact => ({
            id: contact.id,
            name: contact.name,
            categoryId: contact.category_id,
            birthday: contact.birthday,
            frequency: contact.frequency,
            notes: contact.notes,
            customFields: contact.custom_fields || [],
            interactions: interactions.filter(i => i.contact_id === contact.id)
        }));
        
        // Render the contacts
        renderContacts();
        
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
            <button class="btn btn-sm btn-outline-danger delete-category-btn" data-id="${category.id}">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
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
        populateCategorySelect(); // Update select if open
        
    } catch (error) {
        console.error('Error saving category:', error);
        alert('Fout bij opslaan categorie: ' + error.message);
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
        renderContacts(); // Re-render contacts to remove badges
        
    } catch (error) {
        console.error('Error deleting category:', error);
        alert('Fout bij verwijderen categorie: ' + error.message);
    }
}
