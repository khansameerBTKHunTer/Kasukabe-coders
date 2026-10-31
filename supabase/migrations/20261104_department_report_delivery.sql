BEGIN;
-- Professional response assignments must not depend on a successful vision call.
CREATE OR REPLACE FUNCTION public.civiscope_submit_report(report_data jsonb,incident_data jsonb,actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE routing jsonb; team_code text; dept public.departments; new_id uuid; ai jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=actor_id AND approval_status='approved') THEN
  RAISE EXCEPTION 'Account access unavailable' USING ERRCODE='42501'; END IF;
 IF (report_data->>'reporter_id')::uuid IS DISTINCT FROM actor_id OR report_data->>'incident_id' IS DISTINCT FROM incident_data->>'id' THEN
  RAISE EXCEPTION 'Report ownership does not match actor' USING ERRCODE='42501'; END IF;
 new_id := (incident_data->>'id')::uuid;
 routing := COALESCE(NULLIF(incident_data->'routing_decision','null'::jsonb),jsonb_build_object('mode','needs_review','suggested_codes','[]'::jsonb,'assigned_codes','[]'::jsonb,'reasons',jsonb_build_array('Routing requires an admin decision.'),'policy_version','india-relief-v3'));
 ai := incident_data->'ai_assessment';
 IF routing->>'mode' NOT IN ('automatic','needs_review') THEN RAISE EXCEPTION 'Invalid routing decision'; END IF;
 IF routing->>'mode'='automatic' AND (
    ai IS NULL OR ai='null'::jsonb OR COALESCE((ai->>'confidence')::numeric,0)<0.8
    OR COALESCE(ai->>'category','other')='other' OR ai->>'category' IS DISTINCT FROM incident_data->>'category'
    OR report_data->>'source_type'='news_public'
    OR jsonb_array_length(COALESCE(routing->'assigned_codes','[]'::jsonb))=0
    OR routing->'assigned_codes' IS DISTINCT FROM routing->'suggested_codes') THEN
   RAISE EXCEPTION 'Automatic routing does not meet review requirements';
 END IF;
 IF jsonb_array_length(COALESCE(routing->'assigned_codes','[]'::jsonb))>0 AND
    (report_data->>'source_type'='news_public' OR COALESCE(incident_data->>'category','other')='other') THEN
   RAISE EXCEPTION 'A clear first-hand hazard is required for department delivery'; END IF;
 incident_data := incident_data || jsonb_build_object('routing_decision',routing,'status','open','review_required',routing->>'mode'='needs_review');
 INSERT INTO public.incidents SELECT (jsonb_populate_record(NULL::public.incidents,incident_data)).*;
 INSERT INTO public.reports SELECT (jsonb_populate_record(NULL::public.reports,report_data)).*;
 FOR team_code IN SELECT DISTINCT jsonb_array_elements_text(COALESCE(routing->'assigned_codes','[]'::jsonb)) LOOP
   SELECT * INTO dept FROM public.departments d WHERE d.code=team_code;
   IF dept.id IS NULL OR dept.activation_mode NOT IN ('automatic','support') THEN
     RAISE EXCEPTION 'Team unavailable or requires admin activation: %',team_code; END IF;
   IF NOT (COALESCE(routing->'suggested_codes','[]'::jsonb) ? team_code) THEN
     RAISE EXCEPTION 'Assigned department must be a suggested capability'; END IF;
   IF routing->>'mode'='needs_review' AND dept.activation_mode<>'automatic' THEN
     RAISE EXCEPTION 'Pending review can dispatch professional departments only'; END IF;
   IF dept.activation_mode='support' AND (
    incident_data->>'category' IN ('fire','building_damage','electrical_hazard','landslide','medical_emergency')
    OR report_data->>'immediate_danger' IS DISTINCT FROM 'no'
    OR ai->>'severity' IN ('high','critical')
    OR jsonb_array_length(COALESCE(ai->'life_risk_indicators','[]'::jsonb))>0
    OR concat_ws(' ',report_data->>'description',report_data->>'assistance_needed',ai->'secondary_hazards') ~* '\m(trapped|injur(ed|ies|y)|electrocut(ed|ion)?|sparking|live wires?|collapsed?|swift water|deep water|fire|smoke)\M') THEN
     RAISE EXCEPTION 'Relief support requires safe staging review'; END IF;
   INSERT INTO public.assignments (incident_id,department_id,assigned_by,assignment_status,assignment_source,notes)
    VALUES (new_id,dept.id,NULL,'pending','automatic',array_to_string(ARRAY(SELECT jsonb_array_elements_text(routing->'reasons')),' '));
 END LOOP;
 PERFORM private.refresh_response_status(new_id);
 INSERT INTO public.activity_logs (incident_id,actor_id,action,reason,new_value)
 VALUES (new_id,actor_id,'report_created','Report received; evidence remains unverified',jsonb_build_object('report_id',report_data->>'id'));
 INSERT INTO public.activity_logs (incident_id,actor_id,action,reason,new_value)
 VALUES (new_id,NULL,CASE WHEN jsonb_array_length(COALESCE(routing->'assigned_codes','[]'::jsonb))>0 THEN 'response_auto_assigned' ELSE 'routing_review_required' END,'Department delivery policy india-relief-v3',routing);
END;
$$;
REVOKE ALL ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) TO service_role;

-- Recover previously stranded, unassigned first-hand fire reports. Preserve
-- manual choices, rejected assignments, specialist activation and closed history.
DO $$
DECLARE item record; assigned jsonb; target_code text;
BEGIN
 FOR item IN
  SELECT i.id, i.category, r.description FROM public.incidents i
  JOIN LATERAL (SELECT description,source_type FROM public.reports
    WHERE incident_id=i.id ORDER BY created_at LIMIT 1) r ON true
  WHERE i.status='open' AND i.verification_status NOT IN ('rejected','flagged')
    AND i.routing_decision->>'mode'='needs_review'
    AND COALESCE(i.routing_decision->>'policy_version','')<>'india-relief-v3'
    AND r.source_type IN ('on_site','field_report')
    AND NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.incident_id=i.id)
    AND COALESCE(i.routing_decision->'reasons','[]'::jsonb)::text !~* '(nearby similar|duplicate|declined)'
    AND (i.category='fire' OR (
      r.description ~* '\m(fire|flames?|burning|ablaze)\M'
      AND r.description !~* '\m(no|not|without)\M.{0,25}\m(fire|flames?|burning)\M'
      AND r.description !~* '\mfire (department|brigade|services?|team|extinguisher)\M'))
 LOOP
  assigned := '[]'::jsonb;
  FOR target_code IN SELECT d.code FROM public.departments d WHERE d.code IN ('FIRE_RESCUE','MEDICAL') AND d.activation_mode='automatic' LOOP
    INSERT INTO public.assignments (incident_id,department_id,assigned_by,assignment_status,assignment_source,notes)
      SELECT item.id,d.id,NULL,'pending','automatic','Existing fire report delivered to professional response queue; evidence review pending.'
      FROM public.departments d WHERE d.code=target_code;
    assigned := assigned || jsonb_build_array(target_code);
  END LOOP;
  IF jsonb_array_length(assigned)>0 THEN
    UPDATE public.incidents SET category='fire',review_required=true,
      primary_department_id=(SELECT id FROM public.departments WHERE code='FIRE_RESCUE'),
      routing_decision=jsonb_build_object('mode','needs_review','suggested_codes',assigned,'assigned_codes',assigned,
        'reasons',jsonb_build_array('Previously unassigned fire report delivered to professional teams. Admin evidence review remains pending.'),'policy_version','india-relief-v3')
      WHERE id=item.id;
    PERFORM private.refresh_response_status(item.id);
    INSERT INTO public.activity_logs (incident_id,actor_id,action,reason,new_value)
      VALUES (item.id,NULL,'response_auto_assigned','Recovered previously unassigned fire report',jsonb_build_object('assigned_codes',assigned,'policy_version','india-relief-v3'));
  END IF;
 END LOOP;
END $$;
COMMIT;
