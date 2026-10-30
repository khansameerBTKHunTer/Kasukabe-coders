-- Transactional staging fixtures for the final portal migration.
BEGIN;
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('96000000-0000-4000-8000-000000000001','portal-admin@example.invalid','{"role":"admin","approval_status":"approved"}'),
 ('96000000-0000-4000-8000-000000000002','portal-citizen@example.invalid','{"display_name":"Citizen"}'),
 ('96000000-0000-4000-8000-000000000003','portal-fire@example.invalid','{"account_type":"rescue","department_code":"FIRE_RESCUE","organization_name":"Fire unit"}'),
 ('96000000-0000-4000-8000-000000000004','portal-power@example.invalid','{"account_type":"rescue","department_code":"ELECTRICITY","organization_name":"Power unit"}'),
 ('96000000-0000-4000-8000-000000000005','portal-municipal@example.invalid','{"account_type":"rescue","department_code":"MUNICIPAL","organization_name":"Road unit"}'),
 ('96000000-0000-4000-8000-000000000006','portal-medical@example.invalid','{"account_type":"rescue","department_code":"MEDICAL","organization_name":"Medical unit"}');
DO $$ BEGIN
  ASSERT (SELECT role='citizen' FROM public.profiles WHERE id='96000000-0000-4000-8000-000000000001'), 'Metadata must never grant admin';
  ASSERT (SELECT count(*)=4 FROM public.profiles WHERE id::text LIKE '96000000%' AND role IN ('fire_rescue','electricity','municipal','medical') AND approval_status='approved' AND department_id IS NOT NULL), 'All four rescue accounts provision without approval';
  BEGIN
    INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ('96000000-0000-4000-8000-000000000099','bad@example.invalid','{"account_type":"rescue","department_code":"CONTROL_ROOM","organization_name":"Fake"}');
    RAISE EXCEPTION 'Admin department signup succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Select a supported%' THEN RAISE; END IF; END;
END $$;
UPDATE public.profiles SET role='admin', department_id='55555555-5555-5555-5555-555555555555', approval_status='approved' WHERE id='96000000-0000-4000-8000-000000000001';
INSERT INTO public.incidents (id,title,category,latitude,longitude,severity,priority_band) VALUES
 ('97000000-0000-4000-8000-000000000001','Portal incident','fire',0,0,'high','High');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.civiscope_command('assign','97000000-0000-4000-8000-000000000001','{}','96000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Client invoked server-only command'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.reports (reporter_id) VALUES ('96000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Direct client report insert bypassed processing'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.civiscope_command('assign','97000000-0000-4000-8000-000000000001','{"departmentId":"11111111-1111-1111-1111-111111111111"}','96000000-0000-4000-8000-000000000001');
SELECT public.civiscope_command('assign','97000000-0000-4000-8000-000000000001','{"departmentId":"22222222-2222-2222-2222-222222222222"}','96000000-0000-4000-8000-000000000001');
DO $$ DECLARE fire_id uuid; power_id uuid;
BEGIN
  SELECT id INTO fire_id FROM public.assignments WHERE incident_id='97000000-0000-4000-8000-000000000001' AND department_id='11111111-1111-1111-1111-111111111111';
  SELECT id INTO power_id FROM public.assignments WHERE incident_id='97000000-0000-4000-8000-000000000001' AND department_id='22222222-2222-2222-2222-222222222222';
  BEGIN PERFORM public.civiscope_command('status',power_id,'{"status":"acknowledged"}','96000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Cross-department acknowledgement succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.civiscope_command('status',fire_id,'{"status":"resolved"}','96000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'Invalid transition succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Invalid assignment transition' THEN RAISE; END IF; END;
  PERFORM public.civiscope_command('status',fire_id,'{"status":"acknowledged"}','96000000-0000-4000-8000-000000000003');
  PERFORM public.civiscope_command('status',fire_id,'{"status":"en_route"}','96000000-0000-4000-8000-000000000003');
  PERFORM public.civiscope_command('status',fire_id,'{"status":"on_site"}','96000000-0000-4000-8000-000000000003');
  PERFORM public.civiscope_command('evidence',fire_id,'{"imagePath":"supabase://incident-evidence/test/photo.png","description":"Additional field observation"}','96000000-0000-4000-8000-000000000003');
  PERFORM public.civiscope_command('status',fire_id,'{"status":"resolved"}','96000000-0000-4000-8000-000000000003');
  ASSERT (SELECT status <> 'resolved' FROM public.incidents WHERE id='97000000-0000-4000-8000-000000000001'), 'Other department must remain unresolved';
  BEGIN PERFORM public.civiscope_command('close','97000000-0000-4000-8000-000000000001','{}','96000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Premature closure succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'All assignments%' THEN RAISE; END IF; END;
  PERFORM public.civiscope_command('status',power_id,'{"status":"acknowledged"}','96000000-0000-4000-8000-000000000004');
  PERFORM public.civiscope_command('status',power_id,'{"status":"in_progress"}','96000000-0000-4000-8000-000000000004');
  PERFORM public.civiscope_command('status',power_id,'{"status":"resolved"}','96000000-0000-4000-8000-000000000004');
  PERFORM public.civiscope_command('close','97000000-0000-4000-8000-000000000001','{}','96000000-0000-4000-8000-000000000001');
  ASSERT (SELECT status='closed' FROM public.incidents WHERE id='97000000-0000-4000-8000-000000000001'), 'Completed incident closes';
  ASSERT (SELECT count(*)>=10 FROM public.activity_logs WHERE incident_id='97000000-0000-4000-8000-000000000001'), 'Every operation records activity';
END $$;
DO $$ DECLARE i jsonb; r jsonb;
BEGIN
  i := jsonb_build_object('id','98000000-0000-4000-8000-000000000001','title','Submitted report incident','category','other','latitude',0,'longitude',0,'severity','medium','priority_score',35,'priority_band','Medium','verification_status','unverified','status','open');
  r := jsonb_build_object('id','98000000-0000-4000-8000-000000000002','reporter_id','96000000-0000-4000-8000-000000000002','incident_id','98000000-0000-4000-8000-000000000001','image_path','supabase://incident-evidence/test/photo.png','description','Observed flooded road','incident_latitude',0,'incident_longitude',0,'source_type','on_site','assistance_needed','Pumping needed','immediate_danger','unknown','verification_status','unverified');
  PERFORM public.civiscope_submit_report(r,i,'96000000-0000-4000-8000-000000000002');
  ASSERT EXISTS (SELECT 1 FROM public.reports WHERE id='98000000-0000-4000-8000-000000000002'), 'Report persists with its incident';
  i := jsonb_set(i,'{id}','"98000000-0000-4000-8000-000000000003"');
  r := jsonb_set(jsonb_set(r,'{id}','"98000000-0000-4000-8000-000000000004"'),'{incident_id}','"98000000-0000-4000-8000-000000000003"') - 'description';
  BEGIN PERFORM public.civiscope_submit_report(r,i,'96000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Invalid report succeeded'; EXCEPTION WHEN not_null_violation THEN NULL; END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.incidents WHERE id='98000000-0000-4000-8000-000000000003'), 'Failed report rolls back incident creation';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
INSERT INTO storage.objects (bucket_id,name) VALUES ('incident-evidence','96000000-0000-4000-8000-000000000002/test.png');
DO $$ BEGIN
  BEGIN INSERT INTO storage.objects (bucket_id,name) VALUES ('incident-evidence','96000000-0000-4000-8000-000000000003/test.png');
    RAISE EXCEPTION 'Cross-user storage upload succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
