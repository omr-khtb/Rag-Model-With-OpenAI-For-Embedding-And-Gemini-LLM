// config/supabase.js
import { createClient } from '@supabase/supabase-js';

// Check if the environment variables are available, otherwise log an error or use fallback values
const supabaseUrl = process.env.SUPABASE_URL || "https://egoejiejezbuxxuwzzmc.supabase.co";
const supabaseKey = process.env.SUPABASE_API_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnb2VqaWVqZXpidXh4dXd6em1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MTgzMDAsImV4cCI6MjA1ODQ5NDMwMH0.owdeSpDm2HNclzKQh-WE7PcaJC8_M_xAH16sNjRlaKY";
console.log(`Using Supabase URL: ${supabaseUrl}`);
console.log(`Using Supabase API key: ${supabaseKey}`);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_API_KEY) {
  console.error('Error: Missing Supabase URL or API key in environment variables.');
}

export const supabaseClient = createClient(supabaseUrl, supabaseKey);
