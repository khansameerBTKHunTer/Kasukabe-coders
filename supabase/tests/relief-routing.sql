-- Runs after all migrations in an isolated Postgres; fixtures are rolled back.
BEGIN;
DO $$ BEGIN
 ASSERT (SELECT count(*)=11 FROM public.departments WHERE responder_role IS NOT NULL), 'India response directory installed';
 ASSERT (SELECT name='Fire & Emergency Services' FROM public.departments WHERE id='11111111-1111-1111-1111-111111111111'), 'Stable department IDs survive renaming';
END $$;
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('99000000-0000-4000-8000-000000000001','relief-admin@example.invalid','{}'),
 ('99000000-0000-4000-8000-000000000002','relief-citizen@example.invalid','{}'),
 ('99000000-0000-4000-8000-000000000003','relief-roads@example.invalid','{"account_type":"rescue","department_code":"MUNICIPAL","organization_name":"Road unit"}'),
 ('99000000-0000-4000-8000-000000000004','relief-ngo@example.invalid','{"account_type":"rescue","department_code":"NGO_RELIEF","organization_name":"Relief partner"}'),
 ('99000000-0000-4000-8000-000000000005','relief-volunteer@example.invalid','{"account_type":"rescue","department_code":"COMMUNITY_VOLUNTEERS","organization_name":"Community group"}');
UPDATE public.profiles SET role='admin',department_id='55555555-5555-5555-5555-555555555555' WHERE id='99000000-0000-4000-8000-000000000001';
DO $$ BEGIN
 ASSERT (SELECT role='relief_responder' FROM public.profiles WHERE id='99000000-0000-4000-8000-000000000004'), 'NGO responder role provisioned';
 BEGIN
  INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ('99000000-0000-4000-8000-000000000099','fake-force@example.invalid','{"account_type":"rescue","department_code":"NDRF","organization_name":"Fake force"}');
  RAISE EXCEPTION 'Restricted force registration succeeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Select a supported%' THEN RAISE; END IF; END;
 BEGIN UPDATE public.profiles SET department_id='11111111-1111-1111-1111-111111111111' WHERE id='99000000-0000-4000-8000-000000000004';
  RAISE EXCEPTION 'Mismatched relief role succeeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Role must match the response department' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE i jsonb; r jsonb; original_i jsonb; team_id uuid; a record;
BEGIN
 i := '{"id":"99100000-0000-4000-8000-000000000001","title":"Shallow drain obstruction","category":"flood","latitude":18.52,"longitude":73.85,"severity":"low","priority_score":20,"priority_band":"Low","verification_status":"unverified","status":"assigned","ai_assessment":{"category":"flood","confidence":0.95,"human_review_required":false,"severity":"low","life_risk_indicators":[]},"routing_decision":{"mode":"automatic","suggested_codes":["MUNICIPAL","NGO_RELIEF","COMMUNITY_VOLUNTEERS"],"assigned_codes":["MUNICIPAL","NGO_RELIEF","COMMUNITY_VOLUNTEERS"],"reasons":["Clear routine case"],"policy_version":"india-relief-v1"}}';
 r := '{"id":"99200000-0000-4000-8000-000000000001","reporter_id":"99000000-0000-4000-8000-000000000002","incident_id":"99100000-0000-4000-8000-000000000001","image_path":"supabase://incident-evidence/test/photo.png","description":"Shallow water at drain","incident_latitude":18.52,"incident_longitude":73.85,"source_type":"on_site","assistance_needed":"Food at safe relief shelter","immediate_danger":"no","verification_status":"unverified"}';
 original_i := i;
 -- Failure must roll back BOTH records and all automatic assignments.
 i := jsonb_set(i,'{ai_assessment,confidence}','0.2');
 BEGIN PERFORM public.civiscope_submit_report(r,i,'99000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'Low confidence auto routing succeeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Automatic routing does not meet review requirements' THEN RAISE; END IF; END;
 ASSERT NOT EXISTS (SELECT 1 FROM public.incidents WHERE id='99100000-0000-4000-8000-000000000001'), 'Failed auto routing is atomic';
 i := jsonb_set(jsonb_set(original_i,'{routing_decision,assigned_codes}','["NDRF"]'),'{routing_decision,suggested_codes}','["NDRF"]');
 BEGIN PERFORM public.civiscope_submit_report(r,i,'99000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'NDRF auto activation succeeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Team unavailable%' THEN RAISE; END IF; END;
 i := jsonb_set(jsonb_set(original_i,'{category}','"electrical_hazard"'),'{ai_assessment,category}','"electrical_hazard"');
 BEGIN PERFORM public.civiscope_submit_report(r,i,'99000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'Unsafe volunteer routing succeeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Relief support requires safe staging review' THEN RAISE; END IF; END;
 PERFORM public.civiscope_submit_report(r,original_i,'99000000-0000-4000-8000-000000000002');
 ASSERT (SELECT status='assigned' AND verification_status='unverified' FROM public.incidents WHERE id='99100000-0000-4000-8000-000000000001'), 'Auto assignment must not verify the evidence';
 ASSERT (SELECT count(*)=3 FROM public.assignments WHERE incident_id='99100000-0000-4000-8000-000000000001' AND assignment_source='automatic' AND assigned_by IS NULL), 'All selected teams receive system assignments';
 FOR a IN SELECT * FROM public.assignments WHERE incident_id='99100000-0000-4000-8000-000000000001' LOOP
  PERFORM public.civiscope_command('status',a.id,'{"status":"acknowledged"}','99000000-0000-4000-8000-000000000001');
  PERFORM public.civiscope_command('status',a.id,'{"status":"in_progress"}','99000000-0000-4000-8000-000000000001');
  PERFORM public.civiscope_command('status',a.id,'{"status":"resolved","notes":"Observed and completed the assigned work."}','99000000-0000-4000-8000-000000000001');
 END LOOP;
 ASSERT (SELECT status='pending_verification' FROM public.incidents WHERE id='99100000-0000-4000-8000-000000000001'), 'Reported completion awaits admin verification';
 BEGIN PERFORM public.civiscope_command('close','99100000-0000-4000-8000-000000000001','{}','99000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Unverified work closed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'All assignments%' THEN RAISE; END IF; END;
 SELECT id INTO team_id FROM public.assignments WHERE incident_id='99100000-0000-4000-8000-000000000001' AND department_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 BEGIN PERFORM public.civiscope_command('review_response',team_id,'{"decision":"verified","notes":"I verified my own work."}','99000000-0000-4000-8000-000000000004'); RAISE EXCEPTION 'Responder self-approved';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.civiscope_command('review_response',team_id,'{"decision":"rework","notes":"Additional supplies are needed at the shelter."}','99000000-0000-4000-8000-000000000001');
 ASSERT (SELECT status='in_progress' FROM public.incidents WHERE id='99100000-0000-4000-8000-000000000001'), 'Rework reopens active response';
 PERFORM public.civiscope_command('status',team_id,'{"status":"resolved","notes":"Additional supplies delivered and checked."}','99000000-0000-4000-8000-000000000004');
 FOR a IN SELECT * FROM public.assignments WHERE incident_id='99100000-0000-4000-8000-000000000001' LOOP
  PERFORM public.civiscope_command('review_response',a.id,'{"decision":"verified","notes":"Completion notes and field evidence checked."}','99000000-0000-4000-8000-000000000001');
 END LOOP;
 PERFORM public.civiscope_command('close','99100000-0000-4000-8000-000000000001','{}','99000000-0000-4000-8000-000000000001');
 ASSERT (SELECT status='closed' FROM public.incidents WHERE id='99100000-0000-4000-8000-000000000001'), 'Verified response closes';
 -- Clear urgent hazards are dispatched immediately to professional teams.
 i := '{"id":"99100000-0000-4000-8000-000000000003","title":"Active building fire","category":"fire","latitude":18.53,"longitude":73.86,"severity":"critical","priority_score":94,"priority_band":"Critical","verification_status":"unverified","status":"assigned","ai_assessment":{"category":"fire","confidence":0.96,"human_review_required":true,"severity":"critical","life_risk_indicators":["People may be inside"]},"routing_decision":{"mode":"automatic","suggested_codes":["FIRE_RESCUE","MEDICAL"],"assigned_codes":["FIRE_RESCUE","MEDICAL"],"reasons":["Clear urgent incident: professional response teams dispatched immediately"],"policy_version":"india-relief-v2"}}';
 r := '{"id":"99200000-0000-4000-8000-000000000003","reporter_id":"99000000-0000-4000-8000-000000000002","incident_id":"99100000-0000-4000-8000-000000000003","image_path":"supabase://incident-evidence/test/fire.png","description":"Flames and smoke visible from an occupied building","incident_latitude":18.53,"incident_longitude":73.86,"source_type":"on_site","assistance_needed":"Fire suppression and rescue","immediate_danger":"yes","verification_status":"unverified"}';
 PERFORM public.civiscope_submit_report(r,i,'99000000-0000-4000-8000-000000000002');
 ASSERT (SELECT status='assigned' FROM public.incidents WHERE id='99100000-0000-4000-8000-000000000003'), 'Urgent fire is assigned immediately';
 ASSERT (SELECT count(*)=2 FROM public.assignments WHERE incident_id='99100000-0000-4000-8000-000000000003' AND department_id IN ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444')), 'Fire and medical teams receive urgent tasks';
 -- Ambiguous or specialist incidents remain unassigned until admin review.
 i := jsonb_set(jsonb_set(original_i,'{id}','"99100000-0000-4000-8000-000000000002"'),'{routing_decision,mode}','"needs_review"');
 i := jsonb_set(i,'{routing_decision,assigned_codes}','[]');
 r := jsonb_set(jsonb_set(r,'{id}','"99200000-0000-4000-8000-000000000002"'),'{incident_id}','"99100000-0000-4000-8000-000000000002"');
 PERFORM public.civiscope_submit_report(r,i,'99000000-0000-4000-8000-000000000002');
 ASSERT NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id='99100000-0000-4000-8000-000000000002'), 'Review cases receive no automatic tasks';
 PERFORM public.civiscope_command('assign','99100000-0000-4000-8000-000000000002','{"departmentId":"77777777-7777-4777-8777-777777777777"}','99000000-0000-4000-8000-000000000001');
 PERFORM public.civiscope_command('review_routing','99100000-0000-4000-8000-000000000002','{"notes":"Specialist force activation confirmed by the district coordinator."}','99000000-0000-4000-8000-000000000001');
 ASSERT (SELECT routing_decision->>'mode'='manual' FROM public.incidents WHERE id='99100000-0000-4000-8000-000000000002'), 'Admin can explicitly confirm specialist activation';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM public.incidents), 'New NGO role sees only its assigned incident';
 ASSERT (SELECT count(*)=1 FROM public.assignments), 'New NGO role sees only its own assignment';
 ASSERT (SELECT private.responder_department()='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Relief role is tied to the exact department';
 BEGIN PERFORM public.civiscope_command('review_response',gen_random_uuid(),'{}','99000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Client invoked service RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.assignments SET completion_verification='verified'; RAISE EXCEPTION 'Client self-verified work'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
