BEGIN;
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('98000000-0000-4000-8000-000000000001','delivery-citizen@example.invalid','{}'),
 ('98000000-0000-4000-8000-000000000002','delivery-fire@example.invalid','{"account_type":"rescue","department_code":"FIRE_RESCUE","organization_name":"Fire unit"}'),
 ('98000000-0000-4000-8000-000000000003','delivery-power@example.invalid','{"account_type":"rescue","department_code":"ELECTRICITY","organization_name":"Power unit"}');
SET LOCAL ROLE service_role;
DO $$ DECLARE i jsonb; r jsonb;
BEGIN
 i := '{"id":"98000000-0000-4000-8000-000000000004","title":"Fire reported without vision","category":"fire","latitude":12.95,"longitude":77.61,"severity":"medium","priority_score":55,"priority_band":"Medium","verification_status":"unverified","ai_assessment":null,"routing_decision":{"mode":"needs_review","suggested_codes":["FIRE_RESCUE","MEDICAL"],"assigned_codes":["FIRE_RESCUE","MEDICAL"],"reasons":["AI unavailable; clear reported fire routed to professional teams"],"policy_version":"india-relief-v3"}}';
 r := '{"id":"98000000-0000-4000-8000-000000000005","reporter_id":"98000000-0000-4000-8000-000000000001","incident_id":"98000000-0000-4000-8000-000000000004","image_path":"supabase://incident-evidence/fixture/fire.png","description":"The building is on fire and flames are visible","incident_latitude":12.95,"incident_longitude":77.61,"source_type":"on_site","assistance_needed":"Fire suppression and rescue","immediate_danger":"yes","verification_status":"unverified"}';
 PERFORM public.civiscope_submit_report(r,i,'98000000-0000-4000-8000-000000000001');
 ASSERT (SELECT status='assigned' AND review_required AND ai_assessment IS NULL FROM public.incidents WHERE id='98000000-0000-4000-8000-000000000004'), 'Missing AI must not strand a clearly reported fire';
 ASSERT (SELECT count(*)=2 FROM public.assignments WHERE incident_id='98000000-0000-4000-8000-000000000004'), 'Fire and medical assignments created while review remains pending';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT EXISTS (SELECT 1 FROM public.incidents WHERE id='98000000-0000-4000-8000-000000000004'), 'Fire account can see submitted incident';
 ASSERT EXISTS (SELECT 1 FROM public.reports WHERE id='98000000-0000-4000-8000-000000000005'), 'Fire account can see original citizen report';
 ASSERT (SELECT count(*)=1 FROM public.assignments WHERE incident_id='98000000-0000-4000-8000-000000000004'), 'Fire sees only its own task';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM public.incidents WHERE id='98000000-0000-4000-8000-000000000004'), 'Unrelated department cannot read fire report';
END $$;
RESET ROLE;
ROLLBACK;
