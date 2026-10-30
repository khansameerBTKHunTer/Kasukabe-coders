-- ========================================================
-- DAMAGE MAPPER (CIVISCOPE) — LAKSHMIPUR SCENARIO SEED DATA
-- Fictional disaster simulation for Lakshmipur District
-- Repeatable idempotency using fixed UUIDs and ON CONFLICT DO UPDATE
-- ========================================================

-- Fixed Department IDs
-- Fire & Rescue: 11111111-1111-1111-1111-111111111111
-- Electricity:   22222222-2222-2222-2222-222222222222
-- Municipal:     33333333-3333-3333-3333-333333333333
-- Medical:       44444444-4444-4444-4444-444444444444
-- Control Room:  55555555-5555-5555-5555-555555555555

-- Demo User Profiles
INSERT INTO public.profiles (id, email, display_name, role, department_id) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'admin@civiscope.demo', '[Simulated] Command Chief Rahman', 'admin', '55555555-5555-5555-5555-555555555555'),
    ('a0000000-0000-0000-0000-000000000002', 'fire@civiscope.demo', '[Simulated] Captain Hossain (Fire & Rescue)', 'fire_rescue', '11111111-1111-1111-1111-111111111111'),
    ('a0000000-0000-0000-0000-000000000003', 'power@civiscope.demo', '[Simulated] Engr. Tariq (Electricity Dept)', 'electricity', '22222222-2222-2222-2222-222222222222'),
    ('a0000000-0000-0000-0000-000000000004', 'citizen@civiscope.demo', '[Simulated] Citizen Reporter (Lakshmipur Resident)', 'citizen', NULL)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- 4 DISTINCT INCIDENTS (Center: Lakshmipur ~22.9447, 90.8282)

-- Incident 1: Flooded Main Road (College Road)
INSERT INTO public.incidents (
    id, title, category, latitude, longitude, description, 
    visible_damage, secondary_hazards, severity, ai_confidence, 
    ai_assessment, priority_score, priority_band, priority_reasons, 
    review_required, verification_status, primary_department_id, status, created_at
) VALUES (
    'b1000000-0000-0000-0000-000000000001',
    '[Simulated] Severe Flooding along College Road',
    'flood',
    22.9447,
    90.8282,
    '[Simulated] Knee-to-waist deep floodwaters blocking transit along College Road. Submerged drainage gutters causing high current.',
    ARRAY['submerged_roadway', 'overflowing_drainage', 'trapped_vehicles'],
    ARRAY['waterborne_contamination', 'traffic_paralysis'],
    'high',
    0.91,
    '{"category":"flood","title":"Severe Flooding along College Road","visible_damage":["submerged_roadway","overflowing_drainage"],"secondary_hazards":["traffic_paralysis"],"severity":"high","confidence":0.91,"recommended_departments":["Municipal / Road Services"],"life_risk_indicators":[],"critical_infrastructure_indicators":["arterial_road"],"uncertainties":["drainage depth hidden under turbid water"],"human_review_required":false,"summary":"Extensive urban waterlogging on primary transit corridor requiring high-capacity dewatering pumps."}'::jsonb,
    68.5,
    'High',
    ARRAY['Visible damage severity (20% wt): 75/100', 'Secondary hazards (15% wt): 60/100', 'Critical arterial road submerged (10% wt): 80/100'],
    false,
    'verified',
    '33333333-3333-3333-3333-333333333333',
    'assigned',
    NOW() - INTERVAL '3 hours'
) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

-- Incident 2: Fallen Electrical Pole & Live Wire Hazard (College Road Cross-Street)
-- Near Incident 1 (~30m), but distinct hazard & department!
INSERT INTO public.incidents (
    id, title, category, latitude, longitude, description, 
    visible_damage, secondary_hazards, severity, ai_confidence, 
    ai_assessment, priority_score, priority_band, priority_reasons, 
    review_required, verification_status, primary_department_id, status, created_at
) VALUES (
    'b2000000-0000-0000-0000-000000000002',
    '[Simulated] Snapped Concrete Electrical Pole with Sparking Lines',
    'electrical_hazard',
    22.9449,
    90.8284,
    '[Simulated] 11kV distribution pole snapped across walkway and standing water. Sparking observed near transformer base.',
    ARRAY['snapped_concrete_pole', 'downed_conductors_in_water', 'cracked_insulators'],
    ARRAY['electrocution_risk_in_standing_water', 'transformer_oil_leak', 'fire'],
    'critical',
    0.94,
    '{"category":"electrical_hazard","title":"Snapped Concrete Electrical Pole with Sparking Lines","visible_damage":["snapped_concrete_pole","downed_conductors_in_water"],"secondary_hazards":["electrocution_risk_in_standing_water","fire"],"severity":"critical","confidence":0.94,"recommended_departments":["Electricity Department","Fire & Rescue"],"life_risk_indicators":["high voltage conductors in wet public pedestrian zone"],"critical_infrastructure_indicators":["11kV distribution feeder"],"uncertainties":["feeder auto-trip status unknown"],"human_review_required":true,"summary":"High electrocution danger due to downed conductors in waterlogged urban alleyway. Immediate grid isolation mandatory."}'::jsonb,
    89.2,
    'Critical',
    ARRAY['Risk to human life (30% wt): 95/100', 'Visible damage severity (20% wt): 85/100', 'Secondary hazards - electrocution in water (15% wt): 90/100', 'Immediate life threat triggers mandatory priority band'],
    true,
    'verified',
    '22222222-2222-2222-2222-222222222222',
    'in_progress',
    NOW() - INTERVAL '2 hours 40 minutes'
) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

-- Incident 3: Collapsed Commercial Building (Lakshmipur Bazar)
INSERT INTO public.incidents (
    id, title, category, latitude, longitude, description, 
    visible_damage, secondary_hazards, severity, ai_confidence, 
    ai_assessment, priority_score, priority_band, priority_reasons, 
    review_required, verification_status, primary_department_id, status, created_at
) VALUES (
    'b3000000-0000-0000-0000-000000000003',
    '[Simulated] Partial Structural Collapse of 3-Storey Commercial Unit',
    'building_damage',
    22.9410,
    90.8250,
    '[Simulated] Ground floor columns gave way following soil subsidence. Upper floors partially tilted into adjacent alleyway. Possible trapped occupants.',
    ARRAY['column_failure', 'pancake_collapse_facade', 'rubble_blocking_street'],
    ARRAY['secondary_structural_collapse', 'gas_pipe_rupture', 'crushed_utilities'],
    'critical',
    0.96,
    '{"category":"building_damage","title":"Partial Structural Collapse of 3-Storey Commercial Unit","visible_damage":["column_failure","pancake_collapse_facade"],"secondary_hazards":["secondary_structural_collapse","gas_leak"],"severity":"critical","confidence":0.96,"recommended_departments":["Fire & Rescue","Medical Response"],"life_risk_indicators":["occupants reported trapped in ground floor shop"],"critical_infrastructure_indicators":["dense commercial alleyway"],"uncertainties":["exact number trapped inside"],"human_review_required":true,"summary":"Catastrophic structural failure with suspected trapped casualties. Heavy urban search and rescue dispatch required."}'::jsonb,
    94.5,
    'Critical',
    ARRAY['Risk to human life (30% wt): 100/100', 'Visible damage severity (20% wt): 95/100', 'People affected (10% wt): 90/100', 'Time sensitivity (10% wt): 95/100'],
    true,
    'verified',
    '11111111-1111-1111-1111-111111111111',
    'assigned',
    NOW() - INTERVAL '1 hour 50 minutes'
) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

-- Incident 4: Separate Flooded Street (Station Road North)
-- 1.5km north of Incident 1: distinct street flooding
INSERT INTO public.incidents (
    id, title, category, latitude, longitude, description, 
    visible_damage, secondary_hazards, severity, ai_confidence, 
    ai_assessment, priority_score, priority_band, priority_reasons, 
    review_required, verification_status, primary_department_id, status, created_at
) VALUES (
    'b4000000-0000-0000-0000-000000000004',
    '[Simulated] Waterlogged Residential Lane on Station Road North',
    'flood',
    22.9560,
    90.8350,
    '[Simulated] Shallow standing water (1 foot) inundating residential driveways. Light vehicle passage restricted.',
    ARRAY['waterlogged_pavement', 'blocked_stormwater_grates'],
    ARRAY['mosquito_breeding', 'minor_basement_seepage'],
    'medium',
    0.88,
    '{"category":"flood","title":"Waterlogged Residential Lane on Station Road North","visible_damage":["waterlogged_pavement"],"secondary_hazards":["minor_basement_seepage"],"severity":"medium","confidence":0.88,"recommended_departments":["Municipal / Road Services"],"life_risk_indicators":[],"critical_infrastructure_indicators":[],"uncertainties":["stormwater basin outlet capacity"],"human_review_required":false,"summary":"Localized residential water accumulation without structural threat or acute human danger."}'::jsonb,
    46.0,
    'Medium',
    ARRAY['Visible damage severity (20% wt): 40/100', 'People affected (10% wt): 50/100', 'Low life risk (30% wt): 15/100'],
    false,
    'unverified',
    '33333333-3333-3333-3333-333333333333',
    'open',
    NOW() - INTERVAL '50 minutes'
) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

-- 6 SIMULATED REPORTS (Linking to the 4 incidents as planned)

-- Report 1: Initial report for Incident 1 (College Road Flooding)
INSERT INTO public.reports (
    id, reporter_id, incident_id, image_path, description, 
    incident_latitude, incident_longitude, reporter_latitude, reporter_longitude, 
    source_type, assistance_needed, reported_people_affected, immediate_danger, verification_status, created_at
) VALUES (
    'c1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000004',
    'b1000000-0000-0000-0000-000000000001',
    '/simulated-evidence/flood_college_road_1.jpg',
    '[Simulated] College Road completely underwater near the college gate. Cars are stalled and water is rushing into shops.',
    22.9447, 90.8282, 22.9446, 90.8281,
    'on_site',
    'Water pumping and emergency barricades to divert vehicles.',
    15, 'no', 'verified', NOW() - INTERVAL '3 hours'
) ON CONFLICT (id) DO NOTHING;

-- Report 2: Second photograph of the SAME flooded road (Duplicate matched to Incident 1)
INSERT INTO public.reports (
    id, reporter_id, incident_id, image_path, description, 
    incident_latitude, incident_longitude, reporter_latitude, reporter_longitude, 
    source_type, assistance_needed, reported_people_affected, immediate_danger, verification_status, created_at
) VALUES (
    'c2000000-0000-0000-0000-000000000002',
    NULL,
    'b1000000-0000-0000-0000-000000000001', -- Associated to Incident 1
    '/simulated-evidence/flood_college_road_2.jpg',
    '[Simulated] Another angle of College Road flooding. The water level has reached knee height in front of the bookstore.',
    22.9451, 90.8286, 22.9450, 90.8285,
    'field_report',
    'Dewatering pumps urgently required before dark.',
    20, 'no', 'verified', NOW() - INTERVAL '2 hours 45 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Report 3: Initial report for Incident 2 (Fallen Electrical Pole on College Road)
INSERT INTO public.reports (
    id, reporter_id, incident_id, image_path, description, 
    incident_latitude, incident_longitude, reporter_latitude, reporter_longitude, 
    source_type, assistance_needed, reported_people_affected, immediate_danger, verification_status, created_at
) VALUES (
    'c3000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004',
    'b2000000-0000-0000-0000-000000000002',
    '/simulated-evidence/fallen_pole_1.jpg',
    '[Simulated] High tension electric pole collapsed into stagnant flood water. Sparks popping, people shouting to keep distance.',
    22.9449, 90.8284, 22.9448, 90.8282,
    'on_site',
    'Cut off power immediately! Dangerous live wire in water.',
    50, 'yes', 'verified', NOW() - INTERVAL '2 hours 40 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Report 4: Second photograph of the SAME fallen pole (Duplicate matched to Incident 2)
INSERT INTO public.reports (
    id, reporter_id, incident_id, image_path, description, 
    incident_latitude, incident_longitude, reporter_latitude, reporter_longitude, 
    source_type, assistance_needed, reported_people_affected, immediate_danger, verification_status, created_at
) VALUES (
    'c4000000-0000-0000-0000-000000000004',
    NULL,
    'b2000000-0000-0000-0000-000000000002', -- Associated to Incident 2
    '/simulated-evidence/fallen_pole_2.jpg',
    '[Simulated] Close-up view of the damaged transformer and fallen wire hanging over the pathway.',
    22.9448, 90.8285, 22.9447, 90.8284,
    'field_report',
    'Electrical grid shutoff and line replacement crew.',
    30, 'yes', 'verified', NOW() - INTERVAL '2 hours 20 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Report 5: Collapsed building in Lakshmipur Bazar (Incident 3)
INSERT INTO public.reports (
    id, reporter_id, incident_id, image_path, description, 
    incident_latitude, incident_longitude, reporter_latitude, reporter_longitude, 
    source_type, assistance_needed, reported_people_affected, immediate_danger, verification_status, created_at
) VALUES (
    'c5000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000004',
    'b3000000-0000-0000-0000-000000000003',
    '/simulated-evidence/building_collapse_1.jpg',
    '[Simulated] Three storey building foundation gave way. Concrete slabs cracked and front portion collapsed onto the road. People are trapped inside.',
    22.9410, 90.8250, 22.9408, 90.8248,
    'on_site',
    'Heavy search and rescue team, hydraulic cutters, ambulances.',
    12, 'yes', 'verified', NOW() - INTERVAL '1 hour 50 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Report 6: Separate Flooded Street at Station Road North (Incident 4)
INSERT INTO public.reports (
    id, reporter_id, incident_id, image_path, description, 
    incident_latitude, incident_longitude, reporter_latitude, reporter_longitude, 
    source_type, assistance_needed, reported_people_affected, immediate_danger, verification_status, created_at
) VALUES (
    'c6000000-0000-0000-0000-000000000006',
    NULL,
    'b4000000-0000-0000-0000-000000000004',
    '/simulated-evidence/flood_station_road_north.jpg',
    '[Simulated] Water standing on Station Road North lane. Drain is backed up but no homes breached yet.',
    22.9560, 90.8350, 22.9565, 90.8352,
    'news_public',
    'Drain clearing squad.',
    8, 'unknown', 'unverified', NOW() - INTERVAL '50 minutes'
) ON CONFLICT (id) DO NOTHING;

-- ASSIGNMENTS & INITIAL TRACKING

-- Assignment 1: Municipal Dept assigned to Incident 1 (College Road Flooding)
INSERT INTO public.assignments (
    id, incident_id, department_id, assigned_by, 
    assignment_status, assigned_at, acknowledged_at, notes
) VALUES (
    'd1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    'a0000000-0000-0000-0000-000000000001',
    'acknowledged',
    NOW() - INTERVAL '2 hours 40 minutes',
    NOW() - INTERVAL '2 hours 20 minutes',
    '[Simulated] Drainage Team 2 deployed with 2x trailer pumps.'
) ON CONFLICT (id) DO NOTHING;

-- Assignment 2: Electricity Dept assigned to Incident 2 (Fallen Pole)
INSERT INTO public.assignments (
    id, incident_id, department_id, assigned_by, 
    assignment_status, assigned_at, acknowledged_at, notes
) VALUES (
    'd2000000-0000-0000-0000-000000000002',
    'b2000000-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'a0000000-0000-0000-0000-000000000001',
    'in_progress',
    NOW() - INTERVAL '2 hours 30 minutes',
    NOW() - INTERVAL '2 hours 15 minutes',
    '[Simulated] Feeder 4 remote-tripped at Lakshmipur Substation. Rapid repair crew on site isolating wires.'
) ON CONFLICT (id) DO NOTHING;

-- Assignment 3: Fire & Rescue assigned to Incident 3 (Building Collapse)
INSERT INTO public.assignments (
    id, incident_id, department_id, assigned_by, 
    assignment_status, assigned_at, acknowledged_at, notes
) VALUES (
    'd3000000-0000-0000-0000-000000000003',
    'b3000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'a0000000-0000-0000-0000-000000000001',
    'acknowledged',
    NOW() - INTERVAL '1 hour 40 minutes',
    NOW() - INTERVAL '1 hour 30 minutes',
    '[Simulated] Rescue Unit 1 & 2 dispatched with thermal sensors and acoustic search gear.'
) ON CONFLICT (id) DO NOTHING;

-- ACTIVITY LOGS (Realistic Timeline)
INSERT INTO public.activity_logs (incident_id, actor_id, action, old_value, new_value, reason, created_at) VALUES
    ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'report_created', NULL, '{"report_id":"c1000000-0000-0000-0000-000000000001"}'::jsonb, 'Citizen submitted initial flooding report', NOW() - INTERVAL '3 hours'),
    ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'duplicate_confirmed', NULL, '{"duplicate_report_id":"c2000000-0000-0000-0000-000000000002"}'::jsonb, 'Control Room confirmed duplicate report at College Road (distance ~55m)', NOW() - INTERVAL '2 hours 42 minutes'),
    ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'department_assigned', '{"status":"open"}'::jsonb, '{"department":"Municipal / Road Services","status":"assigned"}'::jsonb, 'Arterial blockage requires municipal dewatering', NOW() - INTERVAL '2 hours 40 minutes'),
    ('b2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'department_assigned', '{"status":"open"}'::jsonb, '{"department":"Electricity Department","status":"assigned"}'::jsonb, 'Immediate electrocution threat in standing water', NOW() - INTERVAL '2 hours 30 minutes'),
    ('b2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'assignment_acknowledged', '{"status":"pending"}'::jsonb, '{"status":"acknowledged"}'::jsonb, 'Substation dispatched line isolation squad', NOW() - INTERVAL '2 hours 15 minutes'),
    ('b2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'status_updated', '{"status":"acknowledged"}'::jsonb, '{"status":"in_progress"}'::jsonb, 'Feeder isolated; replacement pole transport en route', NOW() - INTERVAL '1 hour 10 minutes'),
    ('b3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'priority_override', '{"score":88.0}'::jsonb, '{"score":94.5}'::jsonb, 'Eyewitness confirmed two shopkeepers trapped in lower floor', NOW() - INTERVAL '1 hour 45 minutes'),
    ('b3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'assignment_acknowledged', '{"status":"pending"}'::jsonb, '{"status":"acknowledged"}'::jsonb, 'Fire & Rescue specialized USAR unit dispatched', NOW() - INTERVAL '1 hour 30 minutes');
