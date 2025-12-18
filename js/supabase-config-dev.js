/**
 * Development Supabase Configuration
 * 
 * Dit bestand wordt ALLEEN lokaal gebruikt en wordt NIET naar GitHub gepusht.
 * Het bevat de credentials voor de development database.
 */

const SUPABASE_URL = 'https://rzhfwknedklqunrdimvb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGZ3a25lZGtscXVucmRpbXZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5OTU5NDMsImV4cCI6MjA4MTU3MTk0M30.-kSxypCCIxwHiz-2C27kjgTin_9IUOsGlmW4XfBwjBA';

// Initialize Supabase client (renamed to avoid conflict with global supabase from CDN)
let supabaseClient = null;

// Check if credentials are configured
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('DEV Supabase client initialized successfully');
    } catch (error) {
        console.error('Error initializing DEV Supabase:', error);
    }
} else {
    console.warn('DEV Supabase credentials not configured. Using localStorage only.');
}

/**
 * Check if Supabase is configured and ready to use
 * @returns {boolean} - True if Supabase is ready
 */
function isSupabaseConfigured() {
    return supabaseClient !== null;
}

/**
 * Get the current Supabase client
 * @returns {Object|null} - Supabase client or null if not configured
 */
function getSupabaseClient() {
    return supabaseClient;
}
