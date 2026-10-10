// This file creates ONE shared connection to Supabase that every
// page on the site reuses. You only set this up once.

// --- REPLACE THESE TWO LINES ---
// Find these in your Supabase dashboard under: Project Settings > API
const SUPABASE_URL = "http://localhost:8080";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImV4cCI6NDEwMjQ0NDgwMH0.hRvyEMqzzLeFKeNicJ5_cq8w7g3SLP2e2bHkcsI4F0o";
// --------------------------------

// "supabase" here comes from the script tag we load in each HTML
// file before this one — it's the Supabase library itself.
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
