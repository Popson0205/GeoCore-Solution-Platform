-- GeoCore full data reset.
--
-- Run this against your actual database (Supabase SQL editor, or `psql
-- $DATABASE_URL -f backend/scripts/reset_all_data.sql`). This does NOT
-- touch schema/migrations — only data. Pick ONE of the two modes below by
-- commenting/uncommenting; both are provided, only one should run.

-- =====================================================================
-- MODE A — full reset, including your own login (true "new customer").
-- After running this, register a brand-new account and you'll hit the
-- license gate immediately on your first "create project/survey/
-- dashboard" attempt, exactly like a first-time customer would.
-- =====================================================================
TRUNCATE TABLE
  dashboard_widgets,
  dashboards,
  reports,
  attachments,
  records,
  submission_assignees,
  field_definitions,
  form_sections,
  survey_assignments,
  surveys,
  projects,
  licenses,
  customers,
  organisation_members,
  organisations,
  users
CASCADE;

-- =====================================================================
-- MODE B — keep your login, wipe everything else (organisations,
-- projects, surveys, records, dashboards, reports, customers, licenses).
-- Use this instead of Mode A if you want to log back in as yourself and
-- immediately create a fresh organisation to test the license gate with.
-- Comment out Mode A above and uncomment this instead.
-- =====================================================================
-- TRUNCATE TABLE
--   dashboard_widgets,
--   dashboards,
--   reports,
--   attachments,
--   records,
--   submission_assignees,
--   field_definitions,
--   form_sections,
--   survey_assignments,
--   surveys,
--   projects,
--   licenses,
--   customers,
--   organisation_members,
--   organisations
-- CASCADE;
