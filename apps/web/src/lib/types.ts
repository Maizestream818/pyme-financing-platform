export type Role = 'internal_operator' | 'applicant';

export type User = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive?: boolean;
};

export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiEnvelope<T> = {
  data: T;
  meta: ApiMeta;
};

export type ApiErrorDetail = {
  field?: string;
  issue: string;
};

export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  meta?: ApiMeta;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: User;
};

export type Company = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  rfc: string;
  businessType: 'pfae' | 'persona_moral';
  sector: string;
  yearsOperating: string;
  monthlyRevenue: string;
  monthlyExpenses: string;
  employeeCount?: number | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  applicantUserId?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatus =
  | 'draft'
  | 'documents_pending'
  | 'ready_for_analysis'
  | 'analyzed'
  | 'matched'
  | 'decision_published'
  | 'closed';

export type NeedType =
  | 'working_capital'
  | 'equipment'
  | 'invoices'
  | 'expansion'
  | 'other';

export type Application = {
  id: string;
  companyId: string;
  company?: Pick<Company, 'id' | 'legalName' | 'rfc' | 'applicantUserId'>;
  requestedAmount: string;
  desiredTermMonths: number;
  fundingPurpose: string;
  urgencyLevel: 'low' | 'medium' | 'high';
  needType: NeedType;
  validatedNeedType?: NeedType | null;
  needTypeValidatedByUserId?: string | null;
  needTypeValidatedAt?: string | null;
  needTypeValidationNotes?: string | null;
  hasInvoices?: boolean | null;
  hasExistingDebt?: boolean | null;
  existingDebtAmount?: string | null;
  monthlyDebtPayment?: string | null;
  creditCheckAuthorized?: boolean | null;
  creditHistoryStatus?: 'unknown' | 'good' | 'regular' | 'bad' | 'not_available' | null;
  hasCollateral?: boolean | null;
  collateralType?: string | null;
  collateralEstimatedValue?: string | null;
  hasGuarantor?: boolean | null;
  status: ApplicationStatus;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentRequirement = {
  id: string;
  name: string;
  description?: string | null;
  isRequired: boolean;
  appliesTo?: NeedType | null;
  appliesToBusinessType?: 'pfae' | 'persona_moral' | null;
};

export type ApplicationDocument = {
  id: string;
  applicationId: string;
  documentRequirementId: string;
  requirement: DocumentRequirement;
  status: 'pending' | 'uploaded' | 'approved' | 'rejected' | 'not_applicable';
  originalFilename?: string | null;
  storedFilename?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: string | null;
  fileHashSha256?: string | null;
  notes?: string | null;
  uploadedByUserId?: string | null;
  uploadedAt?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StatusHistoryItem = {
  id: string;
  applicationId: string;
  previousStatus?: ApplicationStatus | null;
  newStatus: ApplicationStatus;
  comment?: string | null;
  changedByUserId?: string | null;
  changedAt: string;
};

export type FinancialProduct = {
  id: string;
  name: string;
  description?: string | null;
  minAmount: string;
  maxAmount: string;
  minYearsOperating: string;
  maxResponseDays?: number | null;
  estimatedAnnualRate?: string | null;
  requiresInvoices: boolean;
  requiresBankStatements: boolean;
  requiresCollateral: boolean;
  idealFor?: NeedType | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductRule = {
  id: string;
  financialProductId: string;
  ruleField: string;
  operator: string;
  conditionValue: string;
  conditionValueTo?: string | null;
  scoreWeight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RiskAssessment = {
  id: string;
  applicationId: string;
  estimatedCashflow: string;
  operatingMargin: string;
  requestedAmountToRevenueRatio: string;
  estimatedMonthlyPayment: string;
  totalMonthlyDebtPayment: string;
  debtServiceCoverageRatio: string;
  paymentCapacity: string;
  documentCompletionPercentage: string;
  riskScore: string;
  riskLevel: 'low' | 'medium' | 'high';
  riskReasons?: unknown;
  inputSnapshot?: unknown;
  ruleSetVersion?: string | null;
  calculatedByUserId?: string | null;
  calculatedAt: string;
  createdAt: string;
  matches?: ApplicationMatch[];
};

export type ApplicationMatch = {
  id: string;
  riskAssessmentId: string;
  financialProductId: string;
  financialProduct?: Pick<FinancialProduct, 'id' | 'name' | 'idealFor' | 'isActive'>;
  compatibilityScore: string;
  reason: unknown;
  estimatedAnnualRateUsed?: string | null;
  estimatedMonthlyPayment?: string | null;
  debtServiceCoverageRatio?: string | null;
  calculatedAt: string;
  createdAt: string;
};

export type ApplicationDecision = {
  id: string;
  applicationId: string;
  riskAssessmentId: string;
  selectedMatchId?: string | null;
  selectedMatch?: ApplicationMatch | null;
  decisionStatus: 'under_review' | 'prequalified' | 'not_prequalified' | 'needs_more_information';
  approvedAmount?: string | null;
  approvedTermMonths?: number | null;
  estimatedMonthlyPayment?: string | null;
  publicMessage: string;
  internalNotes?: string | null;
  isPublishedToApplicant: boolean;
  decidedByUserId: string;
  decidedAt: string;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicDecision =
  | {
      applicationId: string;
      status: 'not_published';
      applicationStatus?: ApplicationStatus | null;
      message: string;
    }
  | {
      id: string;
      applicationId: string;
      decisionStatus: ApplicationDecision['decisionStatus'];
      productName?: string | null;
      approvedAmount?: string | null;
      approvedTermMonths?: number | null;
      estimatedMonthlyPayment?: string | null;
      annualInterestRate?: string | null;
      publicMessage: string;
      publishedAt?: string | null;
      legend: string;
    };

export type InternalFile = {
  application: Application;
  company: Company;
  documents: ApplicationDocument[];
  riskAssessments: RiskAssessment[];
  statusHistory: StatusHistoryItem[];
  decisions: ApplicationDecision[];
};
