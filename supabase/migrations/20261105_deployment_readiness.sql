BEGIN;
-- Server-only readiness probe. It exposes no profiles or report content.
CREATE OR REPLACE FUNCTION public.civiscope_deployment_status()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
   'schema_version','20261105',
   'department_count',(SELECT count(*) FROM public.departments WHERE responder_role IS NOT NULL),
   'private_evidence_bucket',EXISTS (SELECT 1 FROM storage.buckets
     WHERE id='incident-evidence' AND NOT public AND file_size_limit=8388608),
   'report_delivery_installed',EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
     JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='civiscope_submit_report'
       AND p.prosrc LIKE '%india-relief-v3%')
 );
$$;
REVOKE ALL ON FUNCTION public.civiscope_deployment_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.civiscope_deployment_status() TO service_role;
COMMIT;
