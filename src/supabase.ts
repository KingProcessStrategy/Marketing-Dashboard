import { createClient } from "@supabase/supabase-js";

// A publishable key is deliberately safe to ship to the browser. Database
// access is enforced by the Row Level Security policies in Supabase.
export const supabase = createClient(
  "https://onvqdrahkwleaecxzhst.supabase.co",
  "sb_publishable_OvO5p6ZEVySMigvye5P11g_AvGslQJ6",
);
