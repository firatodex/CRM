-- Phase 1 Database Migrations
-- Run these in Supabase SQL Editor

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  department TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- 2. Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add columns to deals table
ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS deal_owner_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS delivery_owner_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS implementation_status TEXT DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS deal_assigned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivery_assigned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS delivery_start_date DATE,
ADD COLUMN IF NOT EXISTS delivery_target_date DATE,
ADD COLUMN IF NOT EXISTS delivery_actual_date DATE,
ADD COLUMN IF NOT EXISTS customer_sign_off_date DATE;

-- 4. Add columns to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS owned_by UUID REFERENCES users(id);

-- 5. Add columns to contact_log table
ALTER TABLE contact_log
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- 6. Add columns to payments table
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- 7. Deal ownership history table
CREATE TABLE IF NOT EXISTS deal_ownership_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id),
  previous_owner_id UUID REFERENCES users(id),
  new_owner_id UUID NOT NULL REFERENCES users(id),
  change_type TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Implementations table
CREATE TABLE IF NOT EXISTS implementations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL UNIQUE REFERENCES deals(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'not_started',
  status_updated_at TIMESTAMP WITH TIME ZONE,
  status_updated_by UUID REFERENCES users(id),
  planned_start_date DATE,
  actual_start_date DATE,
  planned_end_date DATE,
  actual_end_date DATE,
  completion_percentage INT DEFAULT 0,
  assigned_to UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- 9. Implementation milestones table
CREATE TABLE IF NOT EXISTS implementation_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_id UUID NOT NULL REFERENCES implementations(id),
  name TEXT NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  actual_date DATE,
  status TEXT DEFAULT 'pending',
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Implementation blockers table
CREATE TABLE IF NOT EXISTS implementation_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_id UUID NOT NULL REFERENCES implementations(id),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  reported_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  status TEXT DEFAULT 'open',
  resolved_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Implementation tasks table
CREATE TABLE IF NOT EXISTS implementation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_id UUID NOT NULL REFERENCES implementations(id),
  task_name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  due_date DATE,
  completed_date DATE,
  task_order INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Customer health table
CREATE TABLE IF NOT EXISTS customer_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES clients(id),
  delivery_score INT DEFAULT 50,
  engagement_score INT DEFAULT 50,
  payment_score INT DEFAULT 50,
  usage_score INT DEFAULT 50,
  satisfaction_score INT DEFAULT 50,
  is_at_churn_risk BOOLEAN DEFAULT false,
  churn_risk_reason TEXT,
  last_assessment_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Health history table
CREATE TABLE IF NOT EXISTS health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  health_score INT,
  health_status TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_deals_deal_owner ON deals(deal_owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_delivery_owner ON deals(delivery_owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_implementation_status ON deals(implementation_status);
CREATE INDEX IF NOT EXISTS idx_implementations_assigned_to ON implementations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_implementations_status ON implementations(status);
CREATE INDEX IF NOT EXISTS idx_implementations_deal_id ON implementations(deal_id);
CREATE INDEX IF NOT EXISTS idx_blockers_implementation ON implementation_blockers(implementation_id);
CREATE INDEX IF NOT EXISTS idx_health_client ON customer_health(client_id);
CREATE INDEX IF NOT EXISTS idx_health_status ON customer_health(is_at_churn_risk);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name);

-- Insert default admin user (replace email with actual user)
INSERT INTO users (email, name, role, is_active) 
VALUES ('dosaniafzal92@gmail.com', 'Afzal Dosani', 'admin', true)
ON CONFLICT (email) DO NOTHING;
