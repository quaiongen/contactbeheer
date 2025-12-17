/**
 * Supabase Configuration
 * 
 * BELANGRIJK: Vervang de onderstaande placeholders met je eigen Supabase project credentials.
 * 
 * Hoe kom je aan deze gegevens:
 * 1. Ga naar https://supabase.com en log in (of maak een account)
 * 2. Maak een nieuw project aan
 * 3. Ga naar Project Settings > API
 * 4. Kopieer de "Project URL" en "anon public" key
 * 
 * Let op: De anon key is veilig om in de frontend te gebruiken.
 * Deze key heeft alleen toegang tot data die je expliciet toestaat via Row Level Security.
 */

const SUPABASE_URL = 'https://ddifqouirbnmozaxkxwy.supabase.co'; // Bijvoorbeeld: https://xxxxxxxxxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkaWZxb3VpcmJubW96YXhreHd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3Nzg5MjMsImV4cCI6MjA3ODM1NDkyM30.ct2haiAyViMJoR7SfxRQu-V_IoQBRERphYiKfoVKb2A'; // Je anon/public key

// Initialize Supabase client (renamed to avoid conflict with global supabase from CDN)
let supabaseClient = null;

// Check if credentials are configured
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized successfully');
    } catch (error) {
        console.error('Error initializing Supabase:', error);
    }
} else {
    console.warn('Supabase credentials not configured. Using localStorage only.');
    console.warn('To enable Supabase: Update SUPABASE_URL and SUPABASE_ANON_KEY in js/supabase-config.js');
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
