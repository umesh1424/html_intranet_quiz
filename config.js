// Supabase client configuration variables.
// Set these through localStorage or the hosted /api/config/get endpoint.
window.DEFAULT_SUPABASE_URL = "";
window.DEFAULT_SUPABASE_ANON_KEY = "";

window.SUPABASE_URL = localStorage.getItem('SUPABASE_URL') || window.DEFAULT_SUPABASE_URL;
window.SUPABASE_ANON_KEY = localStorage.getItem('SUPABASE_ANON_KEY') || window.DEFAULT_SUPABASE_ANON_KEY;
