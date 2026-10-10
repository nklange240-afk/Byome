// This file creates ONE shared connection to Supabase that every
// page on the site reuses. You only set this up once.

// --- REPLACE THESE TWO LINES ---
// Find these in your Supabase dashboard under: Project Settings > API
const SUPABASE_URL = "https://vkgyggdaxutneedwrrhj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrZ3lnZ2RheHV0bmVlZHdycmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzcxNTgsImV4cCI6MjEwNjMxMzE1OH0.5F7viVh3qqXMHnB9XLdAV1Z0oxYWADqm-nHkoWmy94Q";
// --------------------------------

// "supabase" here comes from the script tag we load in each HTML
// file before this one — it's the Supabase library itself.
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
