-- ========================================================
-- DAMAGE MAPPER (CIVISCOPE) DATABASE SCHEMA
-- ========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    capabilities TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROFILES TABLE (Linked with Supabase Auth or Demo Roles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('citizen', 'fire_rescue', 'electricity', 'admin')),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'flood', 'building_damage', 'electrical_hazard', 'fire', 
        'landslide', 'road_blockage', 'medical_emergency', 'other'
    )),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    description TEXT,
    visible_damage TEXT[] DEFAULT '{}',
    secondary_hazards TEXT[] DEFAULT '{}',
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    ai_confidence DOUBLE PRECISION DEFAULT 0.0,
    ai_assessment JSONB DEFAULT '{}'::jsonb,
    priority_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    priority_band TEXT NOT NULL CHECK (priority_band IN ('Critical', 'High', 'Medium', 'Low')),
    priority_reasons TEXT[] DEFAULT '{}',
    review_required BOOLEAN DEFAULT FALSE,
    verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'flagged', 'rejected')),
    primary_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    incident_id UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
    image_path TEXT NOT NULL,
    description TEXT NOT NULL,
    incident_latitude DOUBLE PRECISION NOT NULL,
    incident_longitude DOUBLE PRECISION NOT NULL,
    reporter_latitude DOUBLE PRECISION,
    reporter_longitude DOUBLE PRECISION,
    source_type TEXT NOT NULL CHECK (source_type IN ('on_site', 'field_report', 'news_public')),
    assistance_needed TEXT NOT NULL,
    reported_people_affected INTEGER,
    immediate_danger TEXT NOT NULL CHECK (immediate_danger IN ('yes', 'no', 'unknown')),
    verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assignment_status TEXT NOT NULL DEFAULT 'pending' CHECK (assignment_status IN ('pending', 'acknowledged', 'in_progress', 'resolved', 'rejected')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT
);

-- 6. ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON public.incidents(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON public.incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_coords ON public.incidents(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_reports_incident ON public.reports(incident_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_assignments_incident ON public.assignments(incident_id);
CREATE INDEX IF NOT EXISTS idx_assignments_dept ON public.assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_incident ON public.activity_logs(incident_id);

-- PRE-SEED ESSENTIAL DEPARTMENTS
INSERT INTO public.departments (id, name, code, capabilities) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Fire & Rescue', 'FIRE_RESCUE', ARRAY['structural_collapse', 'fire_suppression', 'flood_rescue', 'hazmat']),
    ('22222222-2222-2222-2222-222222222222', 'Electricity Department', 'ELECTRICITY', ARRAY['grid_isolation', 'fallen_line_repair', 'substation_safety', 'power_restoration']),
    ('33333333-3333-3333-3333-333333333333', 'Municipal / Road Services', 'MUNICIPAL', ARRAY['debris_clearing', 'road_reopening', 'pump_drainage', 'civil_repairs']),
    ('44444444-4444-4444-4444-444444444444', 'Medical Response', 'MEDICAL', ARRAY['paramedics', 'casualty_triage', 'field_ambulance', 'emergency_evacuation']),
    ('55555555-5555-5555-5555-555555555555', 'Control Room / Disaster Management', 'CONTROL_ROOM', ARRAY['overall_coordination', 'inter_agency_command', 'resource_dispatch', 'public_alerts'])
ON CONFLICT (code) DO UPDATE SET capabilities = EXCLUDED.capabilities;

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 1. Departments policies
CREATE POLICY "Departments are readable by all authenticated and anon users"
    ON public.departments FOR SELECT USING (true);

-- 2. Profiles policies
CREATE POLICY "Profiles are readable by authenticated users"
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Reports policies
CREATE POLICY "Anyone can insert reports"
    ON public.reports FOR INSERT WITH CHECK (true);

CREATE POLICY "Reporters can view their own reports"
    ON public.reports FOR SELECT USING (
        auth.uid() = reporter_id 
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'fire_rescue', 'electricity')
        )
    );

-- 4. Incidents policies
CREATE POLICY "Staff can view incidents"
    ON public.incidents FOR SELECT USING (true);

CREATE POLICY "Admins can insert and update incidents"
    ON public.incidents FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 5. Assignments policies
CREATE POLICY "Staff can view assignments"
    ON public.assignments FOR SELECT USING (true);

CREATE POLICY "Admins can manage assignments"
    ON public.assignments FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Assigned departments can acknowledge and update status"
    ON public.assignments FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.department_id = assignments.department_id
        )
    );

-- 6. Activity logs policies
CREATE POLICY "Activity logs are viewable by all staff"
    ON public.activity_logs FOR SELECT USING (true);

CREATE POLICY "Staff can insert activity logs"
    ON public.activity_logs FOR INSERT WITH CHECK (true);
