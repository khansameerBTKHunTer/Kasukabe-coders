-- Review in staging before applying. This migration does not delete or remap data.
BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('citizen', 'fire_rescue', 'electricity', 'municipal', 'medical', 'admin')
);
ALTER TABLE public.profiles ADD COLUMN approval_status text NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));
UPDATE public.profiles SET approval_status = 'approved' WHERE role = 'citizen';
ALTER TABLE public.profiles ALTER COLUMN id DROP DEFAULT;
-- Legacy demo IDs must be reconciled by the backend owner before VALIDATE.
-- NOT VALID enforces the FK for every new profile without deleting legacy data.
ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Definer helpers avoid recursive profiles/assignments RLS. Never accept a user ID.
CREATE FUNCTION private.is_approved_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin' AND approval_status = 'approved');
$$;
CREATE FUNCTION private.responder_department() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.department_id FROM public.profiles p JOIN public.departments d ON d.id = p.department_id
  WHERE p.id = (SELECT auth.uid()) AND p.approval_status = 'approved'
    AND d.code = CASE p.role WHEN 'fire_rescue' THEN 'FIRE_RESCUE'
      WHEN 'electricity' THEN 'ELECTRICITY' WHEN 'municipal' THEN 'MUNICIPAL'
      WHEN 'medical' THEN 'MEDICAL' END;
$$;
CREATE FUNCTION private.can_read_incident(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_approved_admin() OR EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.incident_id = target AND a.department_id = private.responder_department()
  );
$$;
REVOKE ALL ON FUNCTION private.is_approved_admin(), private.responder_department(),
  private.can_read_incident(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_approved_admin(), private.responder_department(),
  private.can_read_incident(uuid) TO authenticated;

-- Clients cannot choose a role, department, or approval status at signup.
CREATE FUNCTION private.create_auth_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role, department_id, approval_status)
  VALUES (NEW.id, NEW.email, COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), 'Citizen'),
    'citizen', NULL, 'approved');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.create_auth_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER create_damage_mapper_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.create_auth_profile();

-- Backfill real Auth users. Conflicting legacy profile emails abort the transaction;
-- resolve those IDs explicitly rather than silently stealing an existing identity.
INSERT INTO public.profiles (id, email, display_name, role, department_id, approval_status)
SELECT u.id, u.email, COALESCE(NULLIF(u.raw_user_meta_data->>'display_name', ''), 'Citizen'),
  'citizen', NULL, 'approved'
FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

CREATE FUNCTION private.check_profile_department() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE expected_code text;
BEGIN
  IF NEW.role = 'citizen' THEN
    IF NEW.department_id IS NOT NULL THEN
      RAISE EXCEPTION 'Citizens cannot belong to a response department';
    END IF;
  ELSE
    expected_code := CASE NEW.role WHEN 'fire_rescue' THEN 'FIRE_RESCUE'
      WHEN 'electricity' THEN 'ELECTRICITY' WHEN 'municipal' THEN 'MUNICIPAL'
      WHEN 'medical' THEN 'MEDICAL' WHEN 'admin' THEN 'CONTROL_ROOM' END;
    IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = NEW.department_id AND code = expected_code) THEN
      RAISE EXCEPTION 'Role must match department code %', expected_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.check_profile_department() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER check_profile_department BEFORE INSERT OR UPDATE OF role, department_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.check_profile_department();

-- Only an approved admin can grant or revoke access, including staff approval.
-- Bootstrap the first admin through a trusted SQL session, never user metadata.
CREATE FUNCTION public.set_profile_access(target_id uuid, new_role text, new_department_id uuid,
  new_approval_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_approved_admin() THEN
    RAISE EXCEPTION 'Approved admin required' USING ERRCODE = '42501';
  END IF;
  IF target_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'An admin cannot change their own access' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET role = new_role, department_id = new_department_id,
    approval_status = new_approval_status WHERE id = target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_profile_access(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_access(uuid, text, uuid, text) TO authenticated;

-- Replace ALL policies on these app tables: permissive policies combine with OR.
DO $$
DECLARE policy record;
BEGIN
  FOR policy IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN
      ('departments', 'profiles', 'reports', 'incidents', 'assignments', 'activity_logs')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy.policyname, policy.schemaname, policy.tablename);
  END LOOP;
END;
$$;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.departments, public.profiles, public.reports, public.incidents,
  public.assignments, public.activity_logs FROM PUBLIC, anon, authenticated;
-- Also clear any preexisting column grants, which table REVOKE does not remove.
DO $$
DECLARE t text; cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['departments','profiles','reports','incidents','assignments','activity_logs'] LOOP
    SELECT string_agg(quote_ident(column_name), ', ') INTO cols FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t;
    EXECUTE format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated',
      cols, cols, cols, cols, t);
  END LOOP;
END;
$$;
GRANT SELECT ON public.departments, public.profiles, public.reports, public.incidents,
  public.assignments, public.activity_logs TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
GRANT INSERT (reporter_id, image_path, description, incident_latitude, incident_longitude,
  reporter_latitude, reporter_longitude, source_type, assistance_needed, reported_people_affected,
  immediate_danger) ON public.reports TO authenticated;
GRANT UPDATE, DELETE ON public.reports TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT INSERT, DELETE ON public.assignments TO authenticated;
GRANT UPDATE (assignment_status, notes) ON public.assignments TO authenticated;
GRANT ALL ON public.departments, public.profiles, public.reports, public.incidents,
  public.assignments, public.activity_logs TO service_role;

CREATE POLICY departments_read ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR private.is_approved_admin());
CREATE POLICY profiles_update_name ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY reports_read ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()) OR private.can_read_incident(incident_id));
CREATE POLICY reports_submit ON public.reports FOR INSERT TO authenticated WITH CHECK (
  reporter_id = (SELECT auth.uid()) AND incident_id IS NULL AND verification_status = 'unverified'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND approval_status = 'approved')
);
CREATE POLICY reports_admin_update ON public.reports FOR UPDATE TO authenticated
  USING (private.is_approved_admin()) WITH CHECK (private.is_approved_admin());
CREATE POLICY reports_admin_delete ON public.reports FOR DELETE TO authenticated USING (private.is_approved_admin());
CREATE POLICY incidents_read ON public.incidents FOR SELECT TO authenticated USING (private.can_read_incident(id));
CREATE POLICY incidents_admin_insert ON public.incidents FOR INSERT TO authenticated WITH CHECK (private.is_approved_admin());
CREATE POLICY incidents_admin_update ON public.incidents FOR UPDATE TO authenticated
  USING (private.is_approved_admin()) WITH CHECK (private.is_approved_admin());
CREATE POLICY incidents_admin_delete ON public.incidents FOR DELETE TO authenticated USING (private.is_approved_admin());
CREATE POLICY assignments_read ON public.assignments FOR SELECT TO authenticated
  USING (private.is_approved_admin() OR department_id = private.responder_department());
CREATE POLICY assignments_admin_insert ON public.assignments FOR INSERT TO authenticated WITH CHECK (private.is_approved_admin());
CREATE POLICY assignments_admin_delete ON public.assignments FOR DELETE TO authenticated USING (private.is_approved_admin());
CREATE POLICY assignments_update ON public.assignments FOR UPDATE TO authenticated
  USING (private.is_approved_admin() OR department_id = private.responder_department())
  WITH CHECK (private.is_approved_admin() OR department_id = private.responder_department());
CREATE POLICY logs_read ON public.activity_logs FOR SELECT TO authenticated USING (private.can_read_incident(incident_id));
-- No client log INSERT policy/grant: trusted backend writes audit events.

COMMIT;
