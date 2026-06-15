CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE business_type AS ENUM ('pfae', 'persona_moral');
CREATE TYPE urgency_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE need_type AS ENUM ('working_capital', 'equipment', 'invoices', 'expansion', 'other');
CREATE TYPE application_status AS ENUM ('draft', 'documents_pending', 'ready_for_analysis', 'analyzed', 'matched', 'decision_published', 'closed');
CREATE TYPE document_status AS ENUM ('pending', 'uploaded', 'approved', 'rejected', 'not_applicable');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE credit_history_status AS ENUM ('unknown', 'good', 'regular', 'bad', 'not_available');
CREATE TYPE rule_operator AS ENUM ('equals', 'not_equals', 'gte', 'lte', 'between', 'contains');
CREATE TYPE rule_field AS ENUM (
  'requested_amount',
  'desired_term_months',
  'urgency_level',
  'need_type',
  'years_operating',
  'monthly_revenue',
  'monthly_expenses',
  'employee_count',
  'document_completion_percentage',
  'risk_level',
  'credit_history_status',
  'has_invoices',
  'has_existing_debt',
  'has_collateral',
  'has_guarantor',
  'debt_service_coverage_ratio'
);
CREATE TYPE decision_status AS ENUM ('under_review', 'prequalified', 'not_prequalified', 'needs_more_information');
CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'deactivate',
  'status_change',
  'upload_document',
  'review_document',
  'calculate_risk',
  'generate_matches',
  'login',
  'publish_decision',
  'validate_need_type',
  'register_applicant',
  'replace_document'
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_users_role_id ON users(role_id);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name VARCHAR(200) NOT NULL,
  trade_name VARCHAR(200),
  rfc VARCHAR(13) NOT NULL UNIQUE,
  business_type business_type NOT NULL,
  sector VARCHAR(100) NOT NULL,
  years_operating DECIMAL(5, 2) NOT NULL,
  monthly_revenue DECIMAL(14, 2) NOT NULL,
  monthly_expenses DECIMAL(14, 2) NOT NULL,
  employee_count INTEGER,
  contact_email VARCHAR(150),
  contact_phone VARCHAR(20),
  applicant_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT chk_companies_years_operating_non_negative CHECK (years_operating >= 0),
  CONSTRAINT chk_companies_monthly_revenue_non_negative CHECK (monthly_revenue >= 0),
  CONSTRAINT chk_companies_monthly_expenses_non_negative CHECK (monthly_expenses >= 0),
  CONSTRAINT chk_companies_employee_count_non_negative CHECK (employee_count IS NULL OR employee_count >= 0)
);

CREATE INDEX idx_companies_business_type ON companies(business_type);
CREATE INDEX idx_companies_applicant_user_id ON companies(applicant_user_id);

CREATE TABLE financing_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  requested_amount DECIMAL(14, 2) NOT NULL,
  desired_term_months INTEGER NOT NULL,
  funding_purpose TEXT NOT NULL,
  urgency_level urgency_level NOT NULL,
  need_type need_type NOT NULL,
  validated_need_type need_type,
  need_type_validated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  need_type_validated_at TIMESTAMP,
  need_type_validation_notes TEXT,
  has_invoices BOOLEAN,
  has_existing_debt BOOLEAN,
  existing_debt_amount DECIMAL(14, 2),
  monthly_debt_payment DECIMAL(14, 2),
  credit_check_authorized BOOLEAN,
  credit_history_status credit_history_status,
  has_collateral BOOLEAN,
  collateral_type VARCHAR(100),
  collateral_estimated_value DECIMAL(14, 2),
  has_guarantor BOOLEAN,
  status application_status NOT NULL DEFAULT 'draft',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT chk_financing_applications_requested_amount_positive CHECK (requested_amount > 0),
  CONSTRAINT chk_financing_applications_desired_term_positive CHECK (desired_term_months > 0),
  CONSTRAINT chk_financing_applications_debt_amount_non_negative CHECK (existing_debt_amount IS NULL OR existing_debt_amount >= 0),
  CONSTRAINT chk_financing_applications_monthly_debt_non_negative CHECK (monthly_debt_payment IS NULL OR monthly_debt_payment >= 0),
  CONSTRAINT chk_financing_applications_collateral_value_non_negative CHECK (collateral_estimated_value IS NULL OR collateral_estimated_value >= 0),
  CONSTRAINT chk_financing_applications_existing_debt_consistency CHECK (
    has_existing_debt IS DISTINCT FROM true OR (existing_debt_amount > 0 AND monthly_debt_payment > 0)
  ),
  CONSTRAINT chk_financing_applications_collateral_consistency CHECK (
    has_collateral IS DISTINCT FROM true OR (collateral_type IS NOT NULL AND collateral_estimated_value > 0)
  ),
  CONSTRAINT chk_financing_applications_validated_need_type_consistency CHECK (
    validated_need_type IS NULL OR (need_type_validated_by_user_id IS NOT NULL AND need_type_validated_at IS NOT NULL)
  )
);

CREATE INDEX idx_financing_applications_company_id ON financing_applications(company_id);
CREATE INDEX idx_financing_applications_status ON financing_applications(status);
CREATE INDEX idx_financing_applications_created_by_user_id ON financing_applications(created_by_user_id);
CREATE INDEX idx_financing_applications_need_type_validated_by ON financing_applications(need_type_validated_by_user_id);

CREATE TABLE document_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  applies_to need_type,
  applies_to_business_type business_type,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_document_requirements_applies_to ON document_requirements(applies_to);
CREATE INDEX idx_document_requirements_business_type ON document_requirements(applies_to_business_type);

CREATE TABLE application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES financing_applications(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  document_requirement_id UUID NOT NULL REFERENCES document_requirements(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status document_status NOT NULL DEFAULT 'pending',
  file_path VARCHAR(500),
  stored_filename VARCHAR(255),
  original_filename VARCHAR(255),
  mime_type VARCHAR(100),
  file_size_bytes BIGINT,
  file_hash_sha256 VARCHAR(64),
  notes TEXT,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  uploaded_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT uq_application_documents_application_requirement UNIQUE (application_id, document_requirement_id),
  CONSTRAINT chk_application_documents_file_size_non_negative CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  CONSTRAINT chk_application_documents_uploaded_metadata CHECK (
    status <> 'uploaded' OR (
      file_path IS NOT NULL
      AND stored_filename IS NOT NULL
      AND mime_type IS NOT NULL
      AND file_size_bytes IS NOT NULL
      AND file_hash_sha256 IS NOT NULL
      AND uploaded_by_user_id IS NOT NULL
      AND uploaded_at IS NOT NULL
    )
  ),
  CONSTRAINT chk_application_documents_review_metadata CHECK (
    status NOT IN ('approved', 'rejected') OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX idx_application_documents_application_id ON application_documents(application_id);
CREATE INDEX idx_application_documents_document_requirement_id ON application_documents(document_requirement_id);
CREATE INDEX idx_application_documents_uploaded_by_user_id ON application_documents(uploaded_by_user_id);
CREATE INDEX idx_application_documents_reviewed_by_user_id ON application_documents(reviewed_by_user_id);

CREATE TABLE financial_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  min_amount DECIMAL(14, 2) NOT NULL,
  max_amount DECIMAL(14, 2) NOT NULL,
  min_years_operating DECIMAL(5, 2) NOT NULL,
  max_response_days INTEGER,
  estimated_annual_rate DECIMAL(5, 2),
  requires_invoices BOOLEAN NOT NULL DEFAULT false,
  requires_bank_statements BOOLEAN NOT NULL DEFAULT true,
  requires_collateral BOOLEAN NOT NULL DEFAULT false,
  ideal_for need_type,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT chk_financial_products_amounts CHECK (min_amount >= 0 AND max_amount >= min_amount),
  CONSTRAINT chk_financial_products_min_years_non_negative CHECK (min_years_operating >= 0),
  CONSTRAINT chk_financial_products_max_response_non_negative CHECK (max_response_days IS NULL OR max_response_days >= 0),
  CONSTRAINT chk_financial_products_rate_non_negative CHECK (estimated_annual_rate IS NULL OR estimated_annual_rate >= 0),
  CONSTRAINT chk_financial_products_active_requires_rate CHECK (is_active = false OR estimated_annual_rate IS NOT NULL)
);

CREATE INDEX idx_financial_products_ideal_for ON financial_products(ideal_for);

CREATE TABLE product_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_product_id UUID NOT NULL REFERENCES financial_products(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  rule_field rule_field NOT NULL,
  operator rule_operator NOT NULL,
  condition_value VARCHAR(100) NOT NULL,
  condition_value_to VARCHAR(100),
  score_weight INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT chk_product_rules_score_weight_range CHECK (score_weight BETWEEN -100 AND 100),
  CONSTRAINT chk_product_rules_between_value CHECK (
    operator <> 'between' OR condition_value_to IS NOT NULL
  )
);

CREATE INDEX idx_product_rules_financial_product_id ON product_rules(financial_product_id);

CREATE TABLE risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES financing_applications(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  estimated_cashflow DECIMAL(14, 2) NOT NULL,
  operating_margin DECIMAL(7, 4) NOT NULL,
  requested_amount_to_revenue_ratio DECIMAL(7, 4) NOT NULL,
  estimated_monthly_payment DECIMAL(14, 2) NOT NULL,
  total_monthly_debt_payment DECIMAL(14, 2) NOT NULL,
  debt_service_coverage_ratio DECIMAL(7, 4) NOT NULL,
  payment_capacity DECIMAL(14, 2) NOT NULL,
  document_completion_percentage DECIMAL(5, 2) NOT NULL,
  risk_score DECIMAL(5, 2) NOT NULL,
  risk_level risk_level NOT NULL,
  risk_reasons JSONB,
  input_snapshot JSONB NOT NULL,
  rule_set_version VARCHAR(50),
  calculated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_risk_assessments_estimated_monthly_payment_non_negative CHECK (estimated_monthly_payment >= 0),
  CONSTRAINT chk_risk_assessments_total_monthly_debt_payment_non_negative CHECK (total_monthly_debt_payment >= 0),
  CONSTRAINT chk_risk_assessments_document_completion_range CHECK (document_completion_percentage BETWEEN 0 AND 100),
  CONSTRAINT chk_risk_assessments_risk_score_range CHECK (risk_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_risk_assessments_application_calculated_at ON risk_assessments(application_id, calculated_at);
CREATE INDEX idx_risk_assessments_calculated_by_user_id ON risk_assessments(calculated_by_user_id);

CREATE TABLE application_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id UUID NOT NULL REFERENCES risk_assessments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  financial_product_id UUID NOT NULL REFERENCES financial_products(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  compatibility_score DECIMAL(5, 2) NOT NULL,
  reason TEXT NOT NULL,
  calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estimated_annual_rate_used DECIMAL(5, 2),
  estimated_monthly_payment DECIMAL(14, 2),
  debt_service_coverage_ratio DECIMAL(7, 4),
  CONSTRAINT uq_application_matches_assessment_product UNIQUE (risk_assessment_id, financial_product_id),
  CONSTRAINT uq_application_matches_id_risk_assessment UNIQUE (id, risk_assessment_id),
  CONSTRAINT chk_application_matches_compatibility_range CHECK (compatibility_score BETWEEN 0 AND 100),
  CONSTRAINT chk_application_matches_rate_non_negative CHECK (estimated_annual_rate_used IS NULL OR estimated_annual_rate_used >= 0),
  CONSTRAINT chk_application_matches_monthly_payment_non_negative CHECK (estimated_monthly_payment IS NULL OR estimated_monthly_payment >= 0),
  CONSTRAINT chk_application_matches_dscr_non_negative CHECK (debt_service_coverage_ratio IS NULL OR debt_service_coverage_ratio >= 0)
);

CREATE INDEX idx_application_matches_risk_assessment_id ON application_matches(risk_assessment_id);
CREATE INDEX idx_application_matches_financial_product_id ON application_matches(financial_product_id);

CREATE TABLE application_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES financing_applications(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  risk_assessment_id UUID NOT NULL REFERENCES risk_assessments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  selected_match_id UUID,
  decision_status decision_status NOT NULL,
  approved_amount DECIMAL(14, 2),
  approved_term_months INTEGER,
  estimated_monthly_payment DECIMAL(14, 2),
  public_message TEXT NOT NULL,
  internal_notes TEXT,
  is_published_to_applicant BOOLEAN NOT NULL DEFAULT false,
  decided_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL,
  CONSTRAINT chk_application_decisions_approved_amount_non_negative CHECK (approved_amount IS NULL OR approved_amount >= 0),
  CONSTRAINT chk_application_decisions_approved_term_positive CHECK (approved_term_months IS NULL OR approved_term_months > 0),
  CONSTRAINT chk_application_decisions_monthly_payment_non_negative CHECK (estimated_monthly_payment IS NULL OR estimated_monthly_payment >= 0),
  CONSTRAINT chk_application_decisions_published_at CHECK (
    is_published_to_applicant = false OR published_at IS NOT NULL
  ),
  CONSTRAINT fk_application_decisions_selected_match_risk_assessment FOREIGN KEY (selected_match_id, risk_assessment_id)
    REFERENCES application_matches(id, risk_assessment_id) ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT chk_application_decisions_prequalified_fields CHECK (
    decision_status <> 'prequalified' OR (approved_amount IS NOT NULL AND approved_amount >= 0 AND approved_term_months IS NOT NULL AND approved_term_months > 0)
  )
);

CREATE INDEX idx_application_decisions_application ON application_decisions(application_id);
CREATE INDEX idx_application_decisions_published ON application_decisions(application_id, is_published_to_applicant);
CREATE INDEX idx_application_decisions_risk_assessment_id ON application_decisions(risk_assessment_id);
CREATE INDEX idx_application_decisions_selected_match_id ON application_decisions(selected_match_id);
CREATE INDEX idx_application_decisions_decided_by_user_id ON application_decisions(decided_by_user_id);
CREATE UNIQUE INDEX unique_published_decision_per_application
  ON application_decisions(application_id)
  WHERE is_published_to_applicant = true;

CREATE TABLE application_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES financing_applications(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  previous_status application_status,
  new_status application_status NOT NULL,
  comment TEXT,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_application_status_history_application_changed_at ON application_status_history(application_id, changed_at);
CREATE INDEX idx_application_status_history_changed_by_user_id ON application_status_history(changed_by_user_id);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  action audit_action NOT NULL,
  entity_name VARCHAR(100) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_name, entity_id);
CREATE INDEX idx_audit_logs_user_created_at ON audit_logs(user_id, created_at);
