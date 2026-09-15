-- interview_sessions: written by the server only.
--
-- TO APPLY WITH THE DEPLOY THAT SHIPS /api/interview-coach/start, NOT BEFORE:
-- the client in production still inserts its interview rows and saves its own
-- report, and this migration makes both fail.
--
-- An interview is now opened by /api/interview-coach/start, which reserves the
-- session's credits and creates the row with the service role, linked to that
-- session; the final report is saved by /api/interview-coach when its stream
-- completes. A signed-in user writing the table directly could create interview
-- rows no session pays for, or give themselves a score. Measured on 2026-09-15,
-- authenticated had no table-wide INSERT or UPDATE, but column grants —
-- INSERT (user_id, job_description, interview_type, difficulty, language) and
-- UPDATE (score, feedback_json) — and the two policies that went with them.
-- Reading one's own interviews stays.

drop policy if exists interview_sessions_insert_own on public.interview_sessions;
drop policy if exists interview_sessions_update_own on public.interview_sessions;

revoke insert, update, delete, truncate on public.interview_sessions from anon, authenticated;

-- A table-wide revoke leaves column grants in place: revoke every column.
revoke insert (id, user_id, job_description, interview_type, difficulty, language, score, feedback_json, created_at, ai_session_id)
  on public.interview_sessions from anon, authenticated;
revoke update (id, user_id, job_description, interview_type, difficulty, language, score, feedback_json, created_at, ai_session_id)
  on public.interview_sessions from anon, authenticated;


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_any_column_privilege(v_role, 'public.interview_sessions', 'INSERT')
       or has_any_column_privilege(v_role, 'public.interview_sessions', 'UPDATE')
       or has_table_privilege(v_role, 'public.interview_sessions', 'DELETE') then
      raise exception 'interview_sessions: % can still write', v_role;
    end if;
  end loop;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'interview_sessions'
                and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'interview_sessions: a write policy remains';
  end if;

  if not has_table_privilege('authenticated', 'public.interview_sessions', 'SELECT')
     or not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'interview_sessions'
                       and policyname = 'interview_sessions_select_own') then
    raise exception 'interview_sessions: users can no longer read their own interviews';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.interview_sessions'::regclass) then
    raise exception 'interview_sessions: row level security is off';
  end if;
end;
$$;
