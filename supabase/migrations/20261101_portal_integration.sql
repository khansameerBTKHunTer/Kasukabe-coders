-- Apply AFTER 20261031_roles_and_access.sql. Review and test in staging first.
-- Self-declared responder registration is permitted; organizational identity is NOT verified.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN organization_name text;
ALTER TABLE public.assignments DROP CONSTRAINT assignments_assignment_status_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_assignment_status_check CHECK (
  assignment_status IN ('pending','acknowledged','en_route','on_site','in_progress','resolved','rejected')
);
-- Operational writes go through checked atomic functions, not arbitrary client updates.
REVOKE INSERT, UPDATE, DELETE ON public.incidents, public.assignments, public.reports FROM authenticated;
REVOKE INSERT (reporter_id, image_path, description, incident_latitude, incident_longitude, reporter_latitude, reporter_longitude, source_type, assistance_needed, reported_people_affected, immediate_danger) ON public.reports FROM authenticated;
REVOKE UPDATE (assignment_status, notes) ON public.assignments FROM authenticated;

CREATE OR REPLACE FUNCTION private.create_auth_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE selected_role text := 'citizen'; dept uuid := NULL; unit_name text;
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' = 'rescue' THEN
    selected_role := CASE NEW.raw_user_meta_data->>'department_code'
      WHEN 'FIRE_RESCUE' THEN 'fire_rescue' WHEN 'ELECTRICITY' THEN 'electricity'
      WHEN 'MUNICIPAL' THEN 'municipal' WHEN 'MEDICAL' THEN 'medical' ELSE NULL END;
    IF selected_role IS NULL THEN RAISE EXCEPTION 'Select a supported response department'; END IF;
    SELECT id INTO dept FROM public.departments WHERE code = NEW.raw_user_meta_data->>'department_code';
    IF dept IS NULL THEN RAISE EXCEPTION 'Department setup is missing'; END IF;
    unit_name := left(NULLIF(btrim(NEW.raw_user_meta_data->>'organization_name'), ''), 120);
    IF unit_name IS NULL THEN RAISE EXCEPTION 'Department unit name is required'; END IF;
  END IF;
  -- Never accept an admin role or approval status from signup metadata.
  INSERT INTO public.profiles (id,email,display_name,role,department_id,approval_status,organization_name)
  VALUES (NEW.id,NEW.email,left(COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'),''),'Citizen'),120),
    selected_role,dept,'approved',unit_name);
  RETURN NEW;
END;
$$;

-- Server-only: actor_id is obtained from verified Supabase Auth, never the request body.
CREATE FUNCTION public.civiscope_submit_report(report_data jsonb, incident_data jsonb, actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor_id AND approval_status = 'approved') THEN
    RAISE EXCEPTION 'Account access unavailable' USING ERRCODE = '42501';
  END IF;
  IF (report_data->>'reporter_id')::uuid IS DISTINCT FROM actor_id
    OR report_data->>'incident_id' IS DISTINCT FROM incident_data->>'id' THEN
    RAISE EXCEPTION 'Report ownership does not match actor' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.incidents SELECT (jsonb_populate_record(NULL::public.incidents, incident_data)).*;
  INSERT INTO public.reports SELECT (jsonb_populate_record(NULL::public.reports, report_data)).*;
  INSERT INTO public.activity_logs (incident_id,actor_id,action,reason,new_value)
    VALUES ((incident_data->>'id')::uuid,actor_id,'report_created','Citizen report received for human review',jsonb_build_object('report_id',report_data->>'id'));
END;
$$;
REVOKE ALL ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) TO service_role;

CREATE FUNCTION public.civiscope_command(command text, target_id uuid, payload jsonb, actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.profiles; assignment public.assignments; incident public.incidents;
  report public.reports; target_incident uuid; old_incident uuid; old_status text;
  next_status text; note text; score double precision; result jsonb; event text;
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id = actor_id AND approval_status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Account access unavailable' USING ERRCODE = '42501'; END IF;
  IF command IN ('assign','verify','priority','close','duplicate','separate') AND actor.role <> 'admin' THEN
    RAISE EXCEPTION 'Control Room access required' USING ERRCODE = '42501';
  END IF;
  note := NULLIF(btrim(payload->>'notes'),'');
  IF command IN ('status','evidence') THEN
    -- Lock the incident first to serialize concurrent resolutions across departments.
    SELECT incident_id INTO target_incident FROM public.assignments WHERE id = target_id;
    SELECT * INTO incident FROM public.incidents WHERE id = target_incident FOR UPDATE;
    SELECT * INTO assignment FROM public.assignments WHERE id = target_id FOR UPDATE;
    IF assignment.id IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
    IF actor.role <> 'admin' AND (actor.role NOT IN ('fire_rescue','electricity','municipal','medical')
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
      IF next_status='rejected' AND length(COALESCE(note,'')) < 5 THEN RAISE EXCEPTION 'Rejection reason must contain at least 5 characters'; END IF;
      UPDATE public.assignments SET assignment_status=next_status,
        acknowledged_at=CASE WHEN next_status='acknowledged' THEN now() ELSE acknowledged_at END,
        completed_at=CASE WHEN next_status='resolved' THEN now() ELSE completed_at END,
        notes=CASE WHEN note IS NULL THEN notes ELSE concat_ws(' | ', notes, note) END
        WHERE id=target_id RETURNING * INTO assignment;
      UPDATE public.incidents SET updated_at=now(), status=CASE
        WHEN NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target_incident AND assignment_status <> 'resolved') THEN 'resolved'
        WHEN EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target_incident AND assignment_status IN ('acknowledged','en_route','on_site','in_progress')) THEN 'in_progress'
        WHEN NOT EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target_incident AND assignment_status <> 'rejected') THEN 'open'
        ELSE status END WHERE id=target_incident;
      event := 'status_updated'; result := to_jsonb(assignment);
    ELSE
      IF length(COALESCE(btrim(payload->>'description'),'')) < 5 THEN RAISE EXCEPTION 'Describe the field evidence'; END IF;
      INSERT INTO public.reports (reporter_id,incident_id,image_path,description,incident_latitude,incident_longitude,source_type,assistance_needed,immediate_danger)
        VALUES (actor_id,target_incident,payload->>'imagePath',payload->>'description',incident.latitude,incident.longitude,'field_report','Field evidence update','unknown') RETURNING * INTO report;
      UPDATE public.incidents SET updated_at=now() WHERE id=target_incident;
      event := 'field_evidence_added'; note := payload->>'description'; result := to_jsonb(report);
    END IF;
  ELSIF command IN ('assign','verify','priority','close') THEN
    target_incident := target_id;
    SELECT * INTO incident FROM public.incidents WHERE id=target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
    old_status := incident.status;
    IF command='assign' THEN
      IF incident.status='closed' THEN RAISE EXCEPTION 'Closed incidents cannot be assigned'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id=(payload->>'departmentId')::uuid AND code <> 'CONTROL_ROOM') THEN RAISE EXCEPTION 'Select a response department'; END IF;
      SELECT * INTO assignment FROM public.assignments WHERE incident_id=target_id AND department_id=(payload->>'departmentId')::uuid AND assignment_status NOT IN ('resolved','rejected');
      IF FOUND THEN RETURN to_jsonb(assignment); END IF;
      INSERT INTO public.assignments (incident_id,department_id,assigned_by,notes)
        VALUES (target_id,(payload->>'departmentId')::uuid,actor_id,note) RETURNING * INTO assignment;
      UPDATE public.incidents SET primary_department_id=COALESCE(primary_department_id,assignment.department_id),
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
        OR EXISTS (SELECT 1 FROM public.assignments WHERE incident_id=target_id AND assignment_status <> 'resolved') THEN
        RAISE EXCEPTION 'All assignments must be resolved before closing';
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

-- Private photographs; reads are issued as short-lived signed URLs after record authorization.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('incident-evidence','incident-evidence',false,8388608,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=8388608, allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY civiscope_upload_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='incident-evidence' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND approval_status='approved')
);
COMMIT;
