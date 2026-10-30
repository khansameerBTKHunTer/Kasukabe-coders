-- Run as postgres against an isolated Supabase/staging database after both migrations.
-- All fixtures and changes roll back. Never run against production.
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('90000000-0000-4000-8000-000000000001', 'security-admin@example.invalid', '{"role":"admin"}'),
 ('90000000-0000-4000-8000-000000000002', 'security-citizen@example.invalid', '{}'),
 ('90000000-0000-4000-8000-000000000003', 'security-fire@example.invalid', '{}'),
 ('90000000-0000-4000-8000-000000000004', 'security-power@example.invalid', '{}'),
 ('90000000-0000-4000-8000-000000000005', 'security-municipal@example.invalid', '{}'),
 ('90000000-0000-4000-8000-000000000006', 'security-medical@example.invalid', '{}');
DO $$ BEGIN
  ASSERT (SELECT role = 'citizen' AND department_id IS NULL AND approval_status = 'approved'
    FROM public.profiles WHERE id = '90000000-0000-4000-8000-000000000001'), 'Signup metadata must not grant admin';
  BEGIN
    INSERT INTO public.profiles (id, display_name, role) VALUES
      ('90000000-0000-4000-8000-000000000099', 'Unlinked', 'citizen');
    RAISE EXCEPTION 'Unlinked profile insert succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
UPDATE public.profiles SET role = 'admin', department_id = '55555555-5555-5555-5555-555555555555', approval_status = 'approved'
  WHERE id = '90000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role = 'fire_rescue', department_id = '11111111-1111-1111-1111-111111111111', approval_status = 'approved'
  WHERE id = '90000000-0000-4000-8000-000000000003';
UPDATE public.profiles SET role = 'electricity', department_id = '22222222-2222-2222-2222-222222222222', approval_status = 'approved'
  WHERE id = '90000000-0000-4000-8000-000000000004';
UPDATE public.profiles SET role = 'municipal', department_id = '33333333-3333-3333-3333-333333333333', approval_status = 'pending'
  WHERE id = '90000000-0000-4000-8000-000000000005';
UPDATE public.profiles SET role = 'medical', department_id = '44444444-4444-4444-4444-444444444444', approval_status = 'approved'
  WHERE id = '90000000-0000-4000-8000-000000000006';
DO $$ BEGIN
  BEGIN
    UPDATE public.profiles SET department_id = '22222222-2222-2222-2222-222222222222'
      WHERE id = '90000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Mismatched department was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Role must match department code%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO public.incidents (id, title, category, latitude, longitude, severity, priority_band) VALUES
 ('91000000-0000-4000-8000-000000000001', 'Security fire fixture', 'fire', 0, 0, 'high', 'High'),
 ('91000000-0000-4000-8000-000000000002', 'Security power fixture', 'electrical_hazard', 0, 0, 'high', 'High');
INSERT INTO public.assignments (id, incident_id, department_id) VALUES
 ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111'),
 ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222'),
 ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000002', '33333333-3333-3333-3333-333333333333'),
 ('92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', '44444444-4444-4444-4444-444444444444');

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.profiles; RAISE EXCEPTION 'Anon read succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.incidents; RAISE EXCEPTION 'Anon incident read succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.reports DEFAULT VALUES; RAISE EXCEPTION 'Anon insert succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.profiles), 'Citizen can only read their own profile';
  ASSERT (SELECT count(*) = 0 FROM public.incidents), 'Citizen cannot browse operational incidents';
  BEGIN UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid(); RAISE EXCEPTION 'Self promotion succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.profiles SET approval_status = 'approved' WHERE id = auth.uid(); RAISE EXCEPTION 'Self approval succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.profiles SET department_id = '11111111-1111-1111-1111-111111111111' WHERE id = auth.uid(); RAISE EXCEPTION 'Self department change succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.set_profile_access(auth.uid(), 'admin', '55555555-5555-5555-5555-555555555555', 'approved');
    RAISE EXCEPTION 'Citizen access RPC succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.activity_logs (incident_id, action) VALUES ('91000000-0000-4000-8000-000000000001', 'fake');
    RAISE EXCEPTION 'Fake audit insert succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.profiles SET display_name = 'Updated name' WHERE id = auth.uid();
INSERT INTO public.reports (reporter_id, image_path, description, incident_latitude, incident_longitude, source_type, assistance_needed, immediate_danger)
  VALUES (auth.uid(), '/test.jpg', 'Own report', 0, 0, 'on_site', 'Help', 'unknown');
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.reports), 'Citizen can read their submitted report';
  ASSERT (SELECT display_name = 'Updated name' FROM public.profiles WHERE id = auth.uid()), 'Self display name update allowed';
  BEGIN
    INSERT INTO public.reports (reporter_id, image_path, description, incident_latitude, incident_longitude, source_type, assistance_needed, immediate_danger)
      VALUES ('90000000-0000-4000-8000-000000000003', '/test.jpg', 'Spoofed reporter', 0, 0, 'on_site', 'Help', 'unknown');
    RAISE EXCEPTION 'Reporter spoofing succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.reports (reporter_id, image_path, description, incident_latitude, incident_longitude, source_type, assistance_needed, immediate_danger, verification_status)
      VALUES (auth.uid(), '/test.jpg', 'Verified spoof', 0, 0, 'on_site', 'Help', 'unknown', 'verified');
    RAISE EXCEPTION 'Verification spoofing succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.incidents WHERE id = '91000000-0000-4000-8000-000000000001'), 'Assigned fire incident visible';
  ASSERT NOT EXISTS (SELECT 1 FROM public.incidents WHERE id = '91000000-0000-4000-8000-000000000002'), 'Other department incident hidden';
  ASSERT NOT EXISTS (SELECT 1 FROM public.assignments WHERE id = '92000000-0000-4000-8000-000000000004'), 'Other department assignment hidden even on shared incident';
  BEGIN UPDATE public.assignments SET department_id = '11111111-1111-1111-1111-111111111111'
    WHERE id = '92000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'Assignment hijack succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.assignments SET assignment_status = 'resolved' WHERE id = '92000000-0000-4000-8000-000000000002';
  ASSERT NOT FOUND, 'Cross-department status update must affect no rows';
END $$;
UPDATE public.assignments SET assignment_status = 'acknowledged' WHERE id = '92000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  ASSERT (SELECT assignment_status = 'acknowledged' FROM public.assignments WHERE id = '92000000-0000-4000-8000-000000000001'), 'Own assignment can be acknowledged';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000005', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) = 0 FROM public.incidents), 'Pending municipal staff has no incident access';
  ASSERT (SELECT count(*) = 0 FROM public.assignments), 'Pending municipal staff has no assignment access';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT public.set_profile_access('90000000-0000-4000-8000-000000000005', 'municipal', '33333333-3333-3333-3333-333333333333', 'approved');
DO $$ BEGIN
  ASSERT (SELECT count(*) >= 6 FROM public.profiles), 'Approved admin can review profiles';
  ASSERT (SELECT count(*) = 2 FROM public.incidents WHERE id::text LIKE '91000000%'), 'Admin can read both incidents';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000005', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.incidents WHERE id = '91000000-0000-4000-8000-000000000002'), 'Approved municipal staff can read their incident';
  ASSERT NOT EXISTS (SELECT 1 FROM public.incidents WHERE id = '91000000-0000-4000-8000-000000000001'), 'Municipal cannot read other incident';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000006', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.incidents WHERE id = '91000000-0000-4000-8000-000000000001'), 'Medical staff can read assigned incident';
  ASSERT NOT EXISTS (SELECT 1 FROM public.incidents WHERE id = '91000000-0000-4000-8000-000000000002'), 'Medical cannot read other incident';
END $$;
RESET ROLE;
ROLLBACK;
