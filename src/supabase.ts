import { createClient } from "@supabase/supabase-js";

// A publishable key is deliberately safe to ship to the browser. Database
// access is enforced by the Row Level Security policies in Supabase. This
// points at the KingProcessStrategy project -- the same Supabase account
// and database that backs the live King Lead Lab product (houston_commercial_leads,
// hpi_admin_users, etc). The outreach_* tables added for this dashboard live
// in that same database, gated by the product's existing is_hpi_admin() check.
export const supabase = createClient(
  "https://awsqnkurnomafqbgmdie.supabase.co",
  "sb_publishable_tcU6rrwyyGA3x95EV4-9OA_0rq9GOhF",
);
