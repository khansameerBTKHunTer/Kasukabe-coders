-- Apply after 20261101_portal_integration.sql. Preserves existing IDs, users and reports.
-- These are response categories within CIVISCOPE, not proof of agency affiliation or external dispatch.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.civiscope_command(text,uuid,jsonb,uuid)') IS NULL
   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='organization_name') THEN
   RAISE EXCEPTION 'Apply 20261101_portal_integration.sql before the India relief routing migration';
 END IF;
END $$;
ALTER TABLE public.departments ADD COLUMN responder_role text;
ALTER TABLE public.departments ADD COLUMN activation_mode text NOT NULL DEFAULT 'admin_only'
  CHECK (activation_mode IN ('automatic','support','admin_only','coordination'));
ALTER TABLE public.departments ADD COLUMN self_registration boolean NOT NULL DEFAULT false;
INSERT INTO public.departments (id,code,name,capabilities,responder_role,activation_mode,self_registration) VALUES
('11111111-1111-1111-1111-111111111111','FIRE_RESCUE','Fire & Emergency Services',ARRAY['fire_suppression','structural_rescue','water_rescue','hazmat'],'fire_rescue','automatic',true),
('22222222-2222-2222-2222-222222222222','ELECTRICITY','Electricity Distribution Utility (DISCOM)',ARRAY['grid_isolation','fallen_line_repair','power_restoration'],'electricity','automatic',true),
('33333333-3333-3333-3333-333333333333','MUNICIPAL','Municipal / Panchayat & Public Works',ARRAY['debris_clearing','road_reopening','pump_drainage','civil_repairs'],'municipal','automatic',true),
('44444444-4444-4444-4444-444444444444','MEDICAL','Health Department & Emergency Medical Services',ARRAY['casualty_triage','ambulance','emergency_care'],'medical','automatic',true),
('55555555-5555-5555-5555-555555555555','CONTROL_ROOM','District Emergency Operations Centre (DEOC)',ARRAY['inter_agency_coordination','resource_requests','public_alerts'],'admin','coordination',false),
('66666666-6666-4666-8666-666666666666','SDRF','State Disaster Response Force (SDRF)',ARRAY['specialist_search_and_rescue','flood_rescue','collapsed_structure_rescue'],'relief_responder','admin_only',false),
('77777777-7777-4777-8777-777777777777','NDRF','National Disaster Response Force (NDRF)',ARRAY['specialist_disaster_response','collapsed_structure_rescue','cbrn_response'],'relief_responder','admin_only',false),
('88888888-8888-4888-8888-888888888888','POLICE','Police & Traffic Control',ARRAY['traffic_diversion','perimeter_control','evacuation_coordination'],'relief_responder','automatic',false),
('99999999-9999-4999-8999-999999999999','CIVIL_DEFENCE','Civil Defence & Home Guards',ARRAY['shelter_support','relief_logistics','evacuation_support'],'relief_responder','support',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','NGO_RELIEF','NGO / Humanitarian Relief Partners',ARRAY['food_distribution','shelter_support','hygiene_kits','relief_logistics'],'relief_responder','support',true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','COMMUNITY_VOLUNTEERS','Community Volunteers / Aapda Mitra',ARRAY['safe_zone_relief','supplies_distribution','community_support'],'relief_responder','support',true)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, capabilities=EXCLUDED.capabilities,
  responder_role=EXCLUDED.responder_role,activation_mode=EXCLUDED.activation_mode,self_registration=EXCLUDED.self_registration;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK
  (role IN ('citizen','fire_rescue','electricity','municipal','medical','relief_responder','admin'));
ALTER TABLE public.incidents DROP CONSTRAINT incidents_status_check;
ALTER TABLE public.incidents ADD CONSTRAINT incidents_status_check CHECK
  (status IN ('open','assigned','in_progress','pending_verification','resolved','closed'));
ALTER TABLE public.incidents ADD COLUMN routing_decision jsonb;
ALTER TABLE public.assignments ADD COLUMN assignment_source text NOT NULL DEFAULT 'manual' CHECK (assignment_source IN ('automatic','manual'));
ALTER TABLE public.assignments ADD COLUMN completion_verification text NOT NULL DEFAULT 'not_submitted'
  CHECK (completion_verification IN ('not_submitted','pending_review','verified','rework'));
ALTER TABLE public.assignments ADD COLUMN reviewed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.assignments ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.assignments ADD COLUMN review_notes text;
-- Preserve closed history; open completed work now appears in the admin review queue.
UPDATE public.assignments a SET completion_verification='pending_review'
 FROM public.incidents i WHERE a.incident_id=i.id AND a.assignment_status='resolved' AND i.status<>'closed';
UPDATE public.incidents SET status='pending_verification' WHERE status='resolved';
-- Put existing unassigned/declined incidents in the exception queue without
-- creating retrospective automatic assignments or changing closed history.
UPDATE public.incidents i SET routing_decision=jsonb_build_object(
 'mode',CASE WHEN NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.incident_id=i.id AND a.assignment_status<>'rejected')
   OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.incident_id=i.id AND a.assignment_status='rejected') THEN 'needs_review' ELSE 'manual' END,
 'suggested_codes',COALESCE((SELECT jsonb_agg(code) FROM public.departments WHERE id=i.primary_department_id AND code<>'CONTROL_ROOM'),'[]'::jsonb),
 'assigned_codes',COALESCE((SELECT jsonb_agg(DISTINCT d.code) FROM public.assignments a JOIN public.departments d ON d.id=a.department_id WHERE a.incident_id=i.id AND a.assignment_status<>'rejected'),'[]'::jsonb),
 'reasons',jsonb_build_array('Existing response operations preserved. Review unassigned or declined tasks; verify completed work.'),
 'policy_version','india-relief-v1') WHERE i.status<>'closed';
UPDATE public.incidents SET review_required=true WHERE routing_decision->>'mode'='needs_review';
CREATE INDEX assignments_work_review_idx ON public.assignments (incident_id) WHERE completion_verification='pending_review';
CREATE INDEX incidents_routing_review_idx ON public.incidents ((routing_decision->>'mode')) WHERE status<>'closed';

CREATE OR REPLACE FUNCTION private.responder_department() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.department_id FROM public.profiles p JOIN public.departments d ON d.id=p.department_id
 WHERE p.id=(SELECT auth.uid()) AND p.approval_status='approved'
 AND p.role<>'admin' AND p.role=d.responder_role AND d.code<>'CONTROL_ROOM';
$$;
CREATE OR REPLACE FUNCTION private.check_profile_department() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role='citizen' THEN
   IF NEW.department_id IS NOT NULL THEN RAISE EXCEPTION 'Citizens cannot belong to a response department'; END IF;
 ELSIF NOT EXISTS (SELECT 1 FROM public.departments WHERE id=NEW.department_id AND responder_role=NEW.role) THEN
   RAISE EXCEPTION 'Role must match the response department';
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION private.create_auth_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE selected_role text := 'citizen'; dept uuid; unit_name text;
BEGIN
 IF NEW.raw_user_meta_data->>'account_type'='rescue' THEN
   SELECT id,responder_role INTO dept,selected_role FROM public.departments
     WHERE code=NEW.raw_user_meta_data->>'department_code' AND self_registration AND responder_role<>'admin';
   IF dept IS NULL THEN RAISE EXCEPTION 'Select a supported response department; restricted agencies require administrator provisioning'; END IF;
   unit_name := left(NULLIF(btrim(NEW.raw_user_meta_data->>'organization_name'),''),120);
   IF unit_name IS NULL THEN RAISE EXCEPTION 'Department unit name is required'; END IF;
 END IF;
 INSERT INTO public.profiles (id,email,display_name,role,department_id,approval_status,organization_name)
 VALUES (NEW.id,NEW.email,left(COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'),''),'Citizen'),120),selected_role,dept,'approved',unit_name);
 RETURN NEW;
END;
$$;
-- Admin provisioning continues through set_profile_access; never trust role metadata.
CREATE FUNCTION private.refresh_response_status(target uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.incidents SET updated_at=now(), status=CASE
  WHEN NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target AND assignment_status<>'rejected') THEN 'open'
  WHEN NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target AND assignment_status NOT IN ('resolved','rejected')) THEN
   CASE WHEN EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target AND assignment_status='resolved' AND completion_verification<>'verified') THEN 'pending_verification' ELSE 'resolved' END
  WHEN EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target AND assignment_status IN ('acknowledged','en_route','on_site','in_progress','resolved')) THEN 'in_progress'
  ELSE 'assigned' END
 WHERE id=target AND status<>'closed';
$$;
REVOKE ALL ON FUNCTION private.refresh_response_status(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.civiscope_submit_report(report_data jsonb,incident_data jsonb,actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE routing jsonb; team_code text; dept public.departments; new_id uuid; ai jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=actor_id AND approval_status='approved') THEN
  RAISE EXCEPTION 'Account access unavailable' USING ERRCODE='42501'; END IF;
 IF (report_data->>'reporter_id')::uuid IS DISTINCT FROM actor_id OR report_data->>'incident_id' IS DISTINCT FROM incident_data->>'id' THEN
  RAISE EXCEPTION 'Report ownership does not match actor' USING ERRCODE='42501'; END IF;
 new_id := (incident_data->>'id')::uuid;
 routing := COALESCE(NULLIF(incident_data->'routing_decision','null'::jsonb),jsonb_build_object('mode','needs_review','suggested_codes','[]'::jsonb,'assigned_codes','[]'::jsonb,'reasons',jsonb_build_array('Routing requires an admin decision.'),'policy_version','india-relief-v1'));
 ai := incident_data->'ai_assessment';
 IF routing->>'mode' NOT IN ('automatic','needs_review') THEN RAISE EXCEPTION 'Invalid routing decision'; END IF;
 IF routing->>'mode'='automatic' THEN
  IF ai IS NULL OR ai='null'::jsonb OR COALESCE((ai->>'confidence')::numeric,0)<0.8
    OR COALESCE((ai->>'human_review_required')::boolean,true)
    OR COALESCE(ai->>'category','other')='other' OR ai->>'category' IS DISTINCT FROM incident_data->>'category'
    OR ai->>'severity' IN ('high','critical') OR incident_data->>'priority_band' IN ('High','Critical')
    OR COALESCE((incident_data->>'priority_score')::numeric,0)>=60
    OR COALESCE(report_data->>'immediate_danger','unknown')<>'no' OR report_data->>'source_type'='news_public'
    OR jsonb_array_length(COALESCE(ai->'life_risk_indicators','[]'::jsonb))>0
    OR jsonb_array_length(COALESCE(routing->'assigned_codes','[]'::jsonb))=0
    OR routing->'assigned_codes' IS DISTINCT FROM routing->'suggested_codes' THEN
      RAISE EXCEPTION 'Automatic routing does not meet review requirements'; END IF;
 ELSE
  routing := jsonb_set(routing,'{assigned_codes}','[]'::jsonb);
 END IF;
 incident_data := incident_data || jsonb_build_object('routing_decision',routing,'status','open','review_required',routing->>'mode'='needs_review');
 INSERT INTO public.incidents SELECT (jsonb_populate_record(NULL::public.incidents,incident_data)).*;
 INSERT INTO public.reports SELECT (jsonb_populate_record(NULL::public.reports,report_data)).*;
 IF routing->>'mode'='automatic' THEN
  FOR team_code IN SELECT DISTINCT jsonb_array_elements_text(routing->'assigned_codes') LOOP
   SELECT * INTO dept FROM public.departments d WHERE d.code=team_code;
   IF dept.id IS NULL OR dept.activation_mode NOT IN ('automatic','support') THEN RAISE EXCEPTION 'Team unavailable or requires admin activation: %',team_code; END IF;
   IF dept.activation_mode='support' AND (ai->>'category' IN ('fire','building_damage','electrical_hazard','landslide','medical_emergency')
    OR concat_ws(' ',report_data->>'description',report_data->>'assistance_needed',ai->'secondary_hazards') ~* '\m(trapped|injur(ed|ies|y)|electrocut(ed|ion)?|sparking|live wires?|collapsed?|swift water|deep water|fire|smoke)\M') THEN
     RAISE EXCEPTION 'Relief support requires safe staging review'; END IF;
   INSERT INTO public.assignments (incident_id,department_id,assigned_by,assignment_status,assignment_source,notes)
    VALUES (new_id,dept.id,NULL,'pending','automatic',array_to_string(ARRAY(SELECT jsonb_array_elements_text(routing->'reasons')),' '));
  END LOOP;
  PERFORM private.refresh_response_status(new_id);
 END IF;
 INSERT INTO public.activity_logs (incident_id,actor_id,action,reason,new_value)
 VALUES (new_id,actor_id,'report_created','Report received; evidence remains unverified',jsonb_build_object('report_id',report_data->>'id'));
 INSERT INTO public.activity_logs (incident_id,actor_id,action,reason,new_value)
 VALUES (new_id,NULL,CASE WHEN routing->>'mode'='automatic' THEN 'response_auto_assigned' ELSE 'routing_review_required' END,'AI and capability routing policy india-relief-v1',routing);
END;
$$;
CREATE OR REPLACE FUNCTION public.civiscope_command(command text, target_id uuid, payload jsonb, actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.profiles; assignment public.assignments; incident public.incidents;
  report public.reports; target_incident uuid; old_incident uuid; old_status text;
  next_status text; note text; score double precision; result jsonb; event text;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id = actor_id AND approval_status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Account access unavailable' USING ERRCODE = '42501'; END IF;
  IF command IN ('assign','verify','priority','close','duplicate','separate','review_response','review_routing') AND actor.role <> 'admin' THEN
    RAISE EXCEPTION 'Control Room access required' USING ERRCODE = '42501';
  END IF;
  note := NULLIF(btrim(payload->>'notes'),'');
  IF command IN ('status','evidence') THEN
    -- Lock the incident first to serialize concurrent resolutions across departments.
    SELECT incident_id INTO target_incident FROM public.assignments WHERE id = target_id;
    SELECT * INTO incident FROM public.incidents WHERE id = target_incident FOR UPDATE;
    SELECT * INTO assignment FROM public.assignments WHERE id = target_id FOR UPDATE;
    IF assignment.id IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
    IF actor.role <> 'admin' AND (actor.role NOT IN ('fire_rescue','electricity','municipal','medical','relief_responder')
      OR actor.department_id IS DISTINCT FROM assignment.department_id) THEN
      RAISE EXCEPTION 'Assignment belongs to another department' USING ERRCODE = '42501';
    END IF;
    IF assignment.assignment_status IN ('resolved','rejected') THEN RAISE EXCEPTION 'Assignment is already completed'; END IF;
    IF command = 'status' THEN
      old_status := assignment.assignment_status; next_status := payload->>'status';
      IF NOT ((old_status='pending' AND next_status IN ('acknowledged','rejected'))
        OR (old_status='acknowledged' AND next_status IN ('en_route','on_site','in_progress','rejected'))
        OR (old_status='en_route' AND next_status IN ('on_site','in_progress','rejected'))
        OR (old_status='on_site' AND next_status IN ('in_progress','resolved','rejected'))
        OR (old_status='in_progress' AND next_status IN ('in_progress','resolved','rejected'))) THEN
        RAISE EXCEPTION 'Invalid assignment transition';
      END IF;
      IF next_status='resolved' AND length(COALESCE(note,'')) < 10 THEN RAISE EXCEPTION 'Describe the completed work using at least 10 characters'; END IF;
      IF next_status='rejected' AND length(COALESCE(note,'')) < 5 THEN RAISE EXCEPTION 'Rejection reason must contain at least 5 characters'; END IF;
      UPDATE public.assignments SET assignment_status=next_status,
        acknowledged_at=CASE WHEN next_status='acknowledged' THEN now() ELSE acknowledged_at END,
        completion_verification=CASE WHEN next_status='resolved' THEN 'pending_review' ELSE completion_verification END,
        reviewed_by=CASE WHEN next_status='resolved' THEN NULL ELSE reviewed_by END,
        reviewed_at=CASE WHEN next_status='resolved' THEN NULL ELSE reviewed_at END,
        review_notes=CASE WHEN next_status='resolved' THEN NULL ELSE review_notes END,
        completed_at=CASE WHEN next_status='resolved' THEN now() ELSE completed_at END,
        notes=CASE WHEN note IS NULL THEN notes ELSE concat_ws(' | ', notes, note) END
        WHERE id=target_id RETURNING * INTO assignment;
      PERFORM private.refresh_response_status(target_incident);
      IF next_status='rejected' THEN
       UPDATE public.incidents SET review_required=true,routing_decision=COALESCE(routing_decision,'{}'::jsonb)||jsonb_build_object('mode','needs_review','reasons',jsonb_build_array('A response team declined its assignment. Admin reassignment is required.'),'policy_version','india-relief-v1') WHERE id=target_incident;
      END IF;
      event := CASE WHEN next_status='resolved' THEN 'response_completion_submitted' ELSE 'status_updated' END; result := to_jsonb(assignment);
    ELSE
      IF length(COALESCE(btrim(payload->>'description'),'')) < 5 THEN RAISE EXCEPTION 'Describe the field evidence'; END IF;
      INSERT INTO public.reports (reporter_id,incident_id,image_path,description,incident_latitude,incident_longitude,source_type,assistance_needed,immediate_danger)
        VALUES (actor_id,target_incident,payload->>'imagePath',payload->>'description',incident.latitude,incident.longitude,'field_report','Field evidence update','unknown') RETURNING * INTO report;
      UPDATE public.incidents SET updated_at=now() WHERE id=target_incident;
      event := 'field_evidence_added'; note := payload->>'description'; result := to_jsonb(report);
    END IF;
  ELSIF command='review_response' THEN
    SELECT incident_id INTO target_incident FROM public.assignments WHERE id=target_id;
    SELECT * INTO incident FROM public.incidents WHERE id=target_incident FOR UPDATE;
    SELECT * INTO assignment FROM public.assignments WHERE id=target_id FOR UPDATE;
    IF incident.status='closed' OR assignment.assignment_status IS DISTINCT FROM 'resolved' OR assignment.completion_verification IS DISTINCT FROM 'pending_review' THEN RAISE EXCEPTION 'Response is not awaiting verification'; END IF;
    IF payload->>'decision' NOT IN ('verified','rework') OR payload->>'decision' IS NULL OR length(COALESCE(note,''))<10 THEN RAISE EXCEPTION 'Provide a review decision and notes of at least 10 characters'; END IF;
    UPDATE public.assignments SET completion_verification=payload->>'decision',reviewed_by=actor_id,reviewed_at=now(),review_notes=note,
      assignment_status=CASE WHEN payload->>'decision'='rework' THEN 'in_progress' ELSE assignment_status END,
      completed_at=CASE WHEN payload->>'decision'='rework' THEN NULL ELSE completed_at END
      WHERE id=target_id RETURNING * INTO assignment;
    PERFORM private.refresh_response_status(target_incident);
    event := CASE WHEN payload->>'decision'='verified' THEN 'response_work_verified' ELSE 'response_rework_requested' END;
    result := to_jsonb(assignment);
  ELSIF command IN ('assign','verify','priority','close','review_routing') THEN
    target_incident := target_id;
    SELECT * INTO incident FROM public.incidents WHERE id=target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
    old_status := incident.status;
    IF command='review_routing' THEN
      IF incident.status='closed' OR length(COALESCE(note,''))<10 OR NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target_id AND assignment_status<>'rejected') THEN RAISE EXCEPTION 'Assign response teams and explain the routing decision using at least 10 characters'; END IF;
      UPDATE public.incidents SET review_required=false,updated_at=now(),routing_decision=COALESCE(routing_decision,'{}'::jsonb)||jsonb_build_object('mode','manual','policy_version','india-relief-v1','assigned_codes',
        (SELECT jsonb_agg(DISTINCT d.code) FROM public.assignments a JOIN public.departments d ON d.id=a.department_id WHERE a.incident_id=target_id AND a.assignment_status<>'rejected'), 'reasons',jsonb_build_array(note)) WHERE id=target_id;
      event := 'routing_review_completed';
    ELSIF command='assign' THEN
      IF incident.status='closed' THEN RAISE EXCEPTION 'Closed incidents cannot be assigned'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id=(payload->>'departmentId')::uuid AND code <> 'CONTROL_ROOM') THEN RAISE EXCEPTION 'Select a response department'; END IF;
      SELECT * INTO assignment FROM public.assignments WHERE incident_id=target_id AND department_id=(payload->>'departmentId')::uuid AND assignment_status NOT IN ('resolved','rejected');
      IF FOUND THEN RETURN to_jsonb(assignment); END IF;
      INSERT INTO public.assignments (incident_id,department_id,assigned_by,notes)
        VALUES (target_id,(payload->>'departmentId')::uuid,actor_id,note) RETURNING * INTO assignment;
      UPDATE public.incidents i SET primary_department_id=CASE
        WHEN EXISTS (SELECT 1 FROM public.assignments a WHERE a.incident_id=target_id AND a.department_id=i.primary_department_id AND a.assignment_status<>'rejected') THEN i.primary_department_id ELSE assignment.department_id END,
        status=CASE WHEN status='in_progress' THEN status ELSE 'assigned' END,updated_at=now() WHERE id=target_id;
      event := 'department_assigned'; result := to_jsonb(assignment);
    ELSIF command='verify' THEN
      next_status := payload->>'status';
      IF next_status NOT IN ('verified','flagged','rejected') THEN RAISE EXCEPTION 'Invalid verification status'; END IF;
      UPDATE public.incidents SET verification_status=next_status,updated_at=now() WHERE id=target_id;
      UPDATE public.reports SET verification_status=CASE WHEN next_status='flagged' THEN 'unverified' ELSE next_status END WHERE incident_id=target_id;
      event := 'incident_verified';
    ELSIF command='priority' THEN
      score := (payload->>'score')::double precision;
      note := btrim(payload->>'reason');
      IF score IS NULL OR score<0 OR score>100 OR length(COALESCE(note,''))<5 THEN RAISE EXCEPTION 'Provide a score from 0 to 100 and an explanation'; END IF;
      UPDATE public.incidents SET priority_score=score, priority_band=CASE WHEN score>=80 THEN 'Critical' WHEN score>=60 THEN 'High' WHEN score>=35 THEN 'Medium' ELSE 'Low' END,
        priority_reasons=array_append(priority_reasons, 'Admin override: ' || note),updated_at=now() WHERE id=target_id;
      event := 'priority_override';
    ELSE
      IF incident.status <> 'resolved' OR NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target_id)
        OR incident.routing_decision->>'mode'='needs_review'
        OR EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target_id AND assignment_status<>'rejected' AND (assignment_status <> 'resolved' OR completion_verification<>'verified')) THEN
        RAISE EXCEPTION 'All assignments must be verified and routing review completed before closing';
      END IF;
      UPDATE public.incidents SET status='closed',updated_at=now() WHERE id=target_id;
      event := 'incident_closed';
    END IF;
    IF result IS NULL THEN SELECT to_jsonb(i) INTO result FROM public.incidents i WHERE id=target_id; END IF;
  ELSIF command IN ('duplicate','separate') THEN
    SELECT * INTO report FROM public.reports WHERE id=target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    target_incident := report.incident_id;
    IF command='duplicate' THEN
      old_incident := report.incident_id; target_incident := (payload->>'targetIncidentId')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.incidents WHERE id=target_incident) THEN RAISE EXCEPTION 'Target incident not found'; END IF;
      UPDATE public.reports SET incident_id=target_incident WHERE id=target_id;
      -- Keep source incidents that still have evidence OR response operations.
      IF old_incident IS DISTINCT FROM target_incident AND NOT EXISTS (SELECT 1 FROM public.reports WHERE incident_id=old_incident)
        AND NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=old_incident) THEN
        UPDATE public.activity_logs SET incident_id=target_incident WHERE incident_id=old_incident;
        DELETE FROM public.incidents WHERE id=old_incident;
      END IF;
      UPDATE public.incidents SET updated_at=now() WHERE id=target_incident;
      SELECT to_jsonb(i) INTO result FROM public.incidents i WHERE id=target_incident;
      event := 'duplicate_confirmed';
    ELSE result := 'true'::jsonb; event := 'duplicate_rejected'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported operation'; END IF;
  INSERT INTO public.activity_logs (incident_id,actor_id,action,old_value,new_value,reason)
    VALUES (target_incident,actor_id,event,jsonb_build_object('status',old_status),COALESCE(payload,'{}'),COALESCE(note,replace(event,'_',' ')));
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.civiscope_command(text,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.civiscope_command(text,uuid,jsonb,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) TO service_role;
COMMIT;
