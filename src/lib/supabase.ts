import { createClient } from '@supabase/supabase-js';

// Fallback to a dummy URL during build time if env var is missing, to prevent build crash
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

// Create a Supabase client with the Service Role Key for backend administrative operations.
// WARNING: NEVER export this client to the frontend!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
