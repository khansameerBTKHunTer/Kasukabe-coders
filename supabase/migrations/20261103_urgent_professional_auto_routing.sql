-- Apply after 20261102_india_relief_routing.sql. This upgrades existing
-- projects so urgency dispatches mandatory professional teams immediately.
DO $$ BEGIN
 IF to_regprocedure('public.civiscope_submit_report(jsonb,jsonb,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Apply 20261102_india_relief_routing.sql first';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.civiscope_submit_report(report_data jsonb,incident_data jsonb,actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE routing jsonb; team_code text; dept public.departments; new_id uuid; ai jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=actor_id AND approval_status='approved') THEN
  RAISE EXCEPTION 'Account access unavailable' USING ERRCODE='42501'; END IF;
 IF (report_data->>'reporter_id')::uuid IS DISTINCT FROM actor_id OR report_data->>'incident_id' IS DISTINCT FROM incident_data->>'id' THEN
  RAISE EXCEPTION 'Report ownership does not match actor' USING ERRCODE='42501'; END IF;
 new_id := (incident_data->>'id')::uuid;
 routing := COALESCE(NULLIF(incident_data->'routing_decision','null'::jsonb),jsonb_build_object('mode','needs_review','suggested_codes','[]'::jsonb,'assigned_codes','[]'::jsonb,'reasons',jsonb_build_array('Routing requires an admin decision.'),'policy_version','india-relief-v2'));
 ai := incident_data->'ai_assessment';
 IF routing->>'mode' NOT IN ('automatic','needs_review') THEN RAISE EXCEPTION 'Invalid routing decision'; END IF;
 IF routing->>'mode'='automatic' THEN
  IF ai IS NULL OR ai='null'::jsonb OR COALESCE((ai->>'confidence')::numeric,0)<0.8
    OR COALESCE(ai->>'category','other')='other' OR ai->>'category' IS DISTINCT FROM incident_data->>'category'
    OR report_data->>'source_type'='news_public'
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
 VALUES (new_id,NULL,CASE WHEN routing->>'mode'='automatic' THEN 'response_auto_assigned' ELSE 'routing_review_required' END,'AI and capability routing policy india-relief-v2',routing);
END;
$$;

REVOKE ALL ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.civiscope_submit_report(jsonb,jsonb,uuid) TO service_role;
