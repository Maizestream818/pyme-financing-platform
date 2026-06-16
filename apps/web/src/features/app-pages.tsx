'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getSession, saveSession, Session } from '../auth/session';
import { AuthGuard } from '../components/auth-guard';
import { Shell } from '../components/shell';
import {
  EmptyState,
  ErrorBox,
  Field,
  Section,
  formatDate,
  formatMoney,
  statusLabel,
} from '../components/ui';
import { api, downloadFile } from '../lib/api';
import type {
  Application,
  ApplicationDecision,
  ApplicationDocument,
  ApplicationMatch,
  ApplicationStatus,
  AuditLog,
  Company,
  FinancialProduct,
  InternalFile,
  LoginResponse,
  NeedType,
  ProductRule,
  PublicDecision,
  RiskAssessment,
  Role,
  StatusHistoryItem,
  User,
} from '../lib/types';

type WorkspaceSection =
  | 'detail'
  | 'documents'
  | 'risk'
  | 'internal-file'
  | 'decisions'
  | 'public-decision';

const needTypes: NeedType[] = [
  'working_capital',
  'equipment',
  'invoices',
  'expansion',
  'other',
];

const applicationStatuses: ApplicationStatus[] = [
  'draft',
  'documents_pending',
  'ready_for_analysis',
  'analyzed',
  'matched',
  'decision_published',
  'closed',
];

const urgencyLevels = ['low', 'medium', 'high'] as const;

const decisionStatuses: ApplicationDecision['decisionStatus'][] = [
  'under_review',
  'prequalified',
  'not_prequalified',
  'needs_more_information',
];

const ruleFields = [
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
  'debt_service_coverage_ratio',
];

const ruleOperators = [
  'equals',
  'not_equals',
  'gte',
  'lte',
  'between',
  'contains',
];

function AuthedPage({
  roles,
  children,
}: {
  roles?: Role[];
  children: (session: Session) => ReactNode;
}) {
  return (
    <AuthGuard roles={roles}>
      {(session) => <Shell session={session}>{children(session)}</Shell>}
    </AuthGuard>
  );
}

function readText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(form: FormData, key: string) {
  const value = readText(form, key);
  return value === '' ? undefined : value;
}

function readNumber(form: FormData, key: string) {
  return Number(readText(form, key));
}

function optionalNumber(form: FormData, key: string) {
  const value = readText(form, key);
  return value === '' ? undefined : Number(value);
}

function optionalInteger(form: FormData, key: string) {
  const value = optionalNumber(form, key);
  return value === undefined ? undefined : Math.trunc(value);
}

function optionalBoolean(form: FormData, key: string) {
  const value = readText(form, key);
  if (value === '') {
    return undefined;
  }

  return value === 'true';
}

function checked(form: FormData, key: string) {
  return form.get(key) === 'on';
}

function jsonBlock(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function isApplicantLocked(status: ApplicationStatus) {
  return [
    'ready_for_analysis',
    'analyzed',
    'matched',
    'decision_published',
    'closed',
  ].includes(status);
}

function isNotPublished(
  decision: PublicDecision,
): decision is Extract<PublicDecision, { status: 'not_published' }> {
  return 'status' in decision && decision.status === 'not_published';
}

function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getSession()) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      const response = await api.post<LoginResponse>('/auth/login', {
        email: readText(form, 'email'),
        password: readText(form, 'password'),
      });
      saveSession(response);
      router.replace('/dashboard');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <form className="auth-card" onSubmit={submit}>
        <h1>Iniciar sesion</h1>
        <p>Acceso para applicants y operadores internos.</p>
        <ErrorBox error={error} />
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
          <Link className="secondary" href="/register">
            Registro applicant
          </Link>
        </div>
      </form>
    </main>
  );
}

export function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      const email = readText(form, 'email');
      const password = readText(form, 'password');
      await api.post<User>('/auth/register', {
        fullName: readText(form, 'fullName'),
        email,
        password,
      });
      const response = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      });
      saveSession(response);
      router.replace('/dashboard');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <form className="auth-card" onSubmit={submit}>
        <h1>Registro applicant</h1>
        <p>La cuenta publica siempre se crea con rol applicant.</p>
        <ErrorBox error={error} />
        <Field label="Nombre completo">
          <input name="fullName" required minLength={2} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Registrando...' : 'Crear cuenta'}
          </button>
          <Link className="secondary" href="/login">
            Ya tengo cuenta
          </Link>
        </div>
      </form>
    </main>
  );
}

export function DashboardPage() {
  return (
    <AuthedPage>
      {(session) => <DashboardContent session={session} />}
    </AuthedPage>
  );
}

function DashboardContent({ session }: { session: Session }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setError(null);
      try {
        const [companyData, applicationData] = await Promise.all([
          api.get<Company[]>('/companies'),
          api.get<Application[]>('/applications'),
        ]);

        if (active) {
          setCompanies(companyData);
          setApplications(applicationData);
        }
      } catch (caught) {
        if (active) {
          setError(caught);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const isOperator = session.user.role === 'internal_operator';

  return (
    <>
      <PageHeading
        title={isOperator ? 'Dashboard interno' : 'Dashboard applicant'}
        description={
          isOperator
            ? 'Vista operativa de empresas, solicitudes y flujo interno.'
            : 'Resumen de tus empresas, solicitudes, documentos y decision publicada.'
        }
        actions={
          <>
            <Link className="secondary" href="/companies">
              Empresas
            </Link>
            <Link className="secondary" href="/applications">
              Solicitudes
            </Link>
          </>
        }
      />
      <ErrorBox error={error} />
      <div className="grid">
        <div className="stat">
          <span>Empresas</span>
          <strong>{loading ? '-' : companies.length}</strong>
        </div>
        <div className="stat">
          <span>Solicitudes</span>
          <strong>{loading ? '-' : applications.length}</strong>
        </div>
        <div className="stat">
          <span>En revision</span>
          <strong>
            {loading
              ? '-'
              : applications.filter(
                  (item) =>
                    !['decision_published', 'closed'].includes(item.status),
                ).length}
          </strong>
        </div>
      </div>
      <Section title="Solicitudes recientes">
        {applications.length === 0 ? (
          <EmptyState>No hay solicitudes registradas.</EmptyState>
        ) : (
          <ApplicationTable
            applications={applications.slice(0, 8)}
            role={session.user.role}
          />
        )}
      </Section>
    </>
  );
}

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<Company | null>(null);
  const [companyApplications, setCompanyApplications] = useState<Application[] | null>(
    null,
  );
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const loadCompanies = useCallback(async () => {
    setCompanies(await api.get<Company[]>('/companies'));
  }, []);

  useEffect(() => {
    loadCompanies().catch(setError);
  }, [loadCompanies]);

  return (
    <AuthedPage roles={['internal_operator', 'applicant']}>
      {(session) => {
        async function submit(event: FormEvent<HTMLFormElement>) {
          event.preventDefault();
          setBusy(true);
          setError(null);

          try {
            const form = new FormData(event.currentTarget);
            const body = {
              legalName: readText(form, 'legalName'),
              tradeName: optionalText(form, 'tradeName'),
              rfc: readText(form, 'rfc').toUpperCase(),
              businessType: readText(form, 'businessType'),
              sector: readText(form, 'sector'),
              yearsOperating: readNumber(form, 'yearsOperating'),
              monthlyRevenue: readNumber(form, 'monthlyRevenue'),
              monthlyExpenses: readNumber(form, 'monthlyExpenses'),
              employeeCount: optionalInteger(form, 'employeeCount'),
              contactEmail: optionalText(form, 'contactEmail'),
              contactPhone: optionalText(form, 'contactPhone'),
              applicantUserId:
                session.user.role === 'internal_operator'
                  ? optionalText(form, 'applicantUserId')
                  : undefined,
            };

            if (editing) {
              await api.patch<Company>(`/companies/${editing.id}`, body);
            } else {
              await api.post<Company>('/companies', body);
            }

            setEditing(null);
            event.currentTarget.reset();
            await loadCompanies();
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }

        async function loadCompanyApplications(company: Company) {
          setError(null);
          try {
            setSelectedCompanyName(company.legalName);
            setCompanyApplications(
              await api.get<Application[]>(`/companies/${company.id}/applications`),
            );
          } catch (caught) {
            setError(caught);
          }
        }

        return (
          <>
            <PageHeading
              title="Empresas"
              description={
                session.user.role === 'applicant'
                  ? 'Gestiona solo tus empresas propias.'
                  : 'Gestiona empresas de todos los applicants.'
              }
            />
            <ErrorBox error={error} />
            <Section title={editing ? 'Editar empresa' : 'Nueva empresa'}>
              <form key={editing?.id ?? 'new'} onSubmit={submit}>
                <div className="form-grid">
                  <Field label="Razon social">
                    <input
                      name="legalName"
                      defaultValue={editing?.legalName ?? ''}
                      minLength={2}
                      required
                    />
                  </Field>
                  <Field label="Nombre comercial">
                    <input name="tradeName" defaultValue={editing?.tradeName ?? ''} />
                  </Field>
                  <Field label="RFC">
                    <input
                      name="rfc"
                      defaultValue={editing?.rfc ?? ''}
                      minLength={12}
                      maxLength={13}
                      required
                    />
                  </Field>
                  <Field label="Tipo de negocio">
                    <select
                      name="businessType"
                      defaultValue={editing?.businessType ?? 'persona_moral'}
                    >
                      <option value="persona_moral">persona_moral</option>
                      <option value="pfae">pfae</option>
                    </select>
                  </Field>
                  <Field label="Sector">
                    <input
                      name="sector"
                      defaultValue={editing?.sector ?? ''}
                      minLength={2}
                      required
                    />
                  </Field>
                  <Field label="Anios operando">
                    <input
                      name="yearsOperating"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={editing?.yearsOperating ?? ''}
                      required
                    />
                  </Field>
                  <Field label="Ingresos mensuales">
                    <input
                      name="monthlyRevenue"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={editing?.monthlyRevenue ?? ''}
                      required
                    />
                  </Field>
                  <Field label="Gastos mensuales">
                    <input
                      name="monthlyExpenses"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={editing?.monthlyExpenses ?? ''}
                      required
                    />
                  </Field>
                  <Field label="Empleados">
                    <input
                      name="employeeCount"
                      type="number"
                      min="0"
                      defaultValue={editing?.employeeCount ?? ''}
                    />
                  </Field>
                  <Field label="Email contacto">
                    <input
                      name="contactEmail"
                      type="email"
                      defaultValue={editing?.contactEmail ?? ''}
                    />
                  </Field>
                  <Field label="Telefono contacto">
                    <input
                      name="contactPhone"
                      defaultValue={editing?.contactPhone ?? ''}
                    />
                  </Field>
                  {session.user.role === 'internal_operator' ? (
                    <Field label="Applicant user id (opcional)">
                      <input
                        name="applicantUserId"
                        defaultValue={editing?.applicantUserId ?? ''}
                      />
                    </Field>
                  ) : null}
                </div>
                <div className="actions">
                  <button type="submit" disabled={busy}>
                    {busy ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear'}
                  </button>
                  {editing ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditing(null)}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>
            </Section>
            <Section title="Listado">
              {companies.length === 0 ? (
                <EmptyState>No hay empresas.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>RFC</th>
                        <th>Tipo</th>
                        <th>Ingresos</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((company) => (
                        <tr key={company.id}>
                          <td>
                            <strong>{company.legalName}</strong>
                            <br />
                            <span className="muted">{company.sector}</span>
                          </td>
                          <td>{company.rfc}</td>
                          <td>{company.businessType}</td>
                          <td>{formatMoney(company.monthlyRevenue)}</td>
                          <td>
                            <div className="actions">
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => setEditing(company)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => loadCompanyApplications(company)}
                              >
                                Solicitudes
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            {companyApplications ? (
              <Section title={`Solicitudes de ${selectedCompanyName}`}>
                {companyApplications.length === 0 ? (
                  <EmptyState>No hay solicitudes para esta empresa.</EmptyState>
                ) : (
                  <ApplicationTable
                    applications={companyApplications}
                    role={session.user.role}
                  />
                )}
              </Section>
            ) : null}
          </>
        );
      }}
    </AuthedPage>
  );
}

export function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [companyData, applicationData] = await Promise.all([
      api.get<Company[]>('/companies'),
      api.get<Application[]>('/applications'),
    ]);
    setCompanies(companyData);
    setApplications(applicationData);
  }, []);

  useEffect(() => {
    load().catch(setError);
  }, [load]);

  return (
    <AuthedPage roles={['internal_operator', 'applicant']}>
      {(session) => {
        async function submit(event: FormEvent<HTMLFormElement>) {
          event.preventDefault();
          setBusy(true);
          setError(null);

          try {
            const form = new FormData(event.currentTarget);
            await api.post<Application>('/applications', {
              companyId: readText(form, 'companyId'),
              requestedAmount: readNumber(form, 'requestedAmount'),
              desiredTermMonths: Math.trunc(readNumber(form, 'desiredTermMonths')),
              fundingPurpose: readText(form, 'fundingPurpose'),
              urgencyLevel: readText(form, 'urgencyLevel'),
              needType: readText(form, 'needType'),
            });
            event.currentTarget.reset();
            await load();
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }

        return (
          <>
            <PageHeading
              title="Solicitudes"
              description={
                session.user.role === 'applicant'
                  ? 'Crea solicitudes solo para empresas propias.'
                  : 'Opera todas las solicitudes del MVP.'
              }
            />
            <ErrorBox error={error} />
            <Section title="Nueva solicitud">
              {companies.length === 0 ? (
                <EmptyState>Primero registra una empresa.</EmptyState>
              ) : (
                <form onSubmit={submit}>
                  <div className="form-grid">
                    <Field label="Empresa">
                      <select name="companyId" required>
                        <option value="">Selecciona empresa</option>
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.legalName} - {company.rfc}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Monto solicitado">
                      <input
                        name="requestedAmount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                      />
                    </Field>
                    <Field label="Plazo deseado (meses)">
                      <input
                        name="desiredTermMonths"
                        type="number"
                        min="1"
                        required
                      />
                    </Field>
                    <Field label="Urgencia">
                      <select name="urgencyLevel" defaultValue="medium">
                        {urgencyLevels.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tipo de necesidad">
                      <select name="needType" defaultValue="working_capital">
                        {needTypes.map((type) => (
                          <option key={type} value={type}>
                            {statusLabel(type)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Destino del financiamiento">
                      <textarea name="fundingPurpose" minLength={5} required />
                    </Field>
                  </div>
                  <div className="actions">
                    <button type="submit" disabled={busy}>
                      {busy ? 'Creando...' : 'Crear solicitud'}
                    </button>
                  </div>
                </form>
              )}
            </Section>
            <Section title="Listado">
              {applications.length === 0 ? (
                <EmptyState>No hay solicitudes.</EmptyState>
              ) : (
                <ApplicationTable
                  applications={applications}
                  role={session.user.role}
                />
              )}
            </Section>
          </>
        );
      }}
    </AuthedPage>
  );
}

function ApplicationTable({
  applications,
  role,
}: {
  applications: Application[];
  role: Role;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Solicitud</th>
            <th>Empresa</th>
            <th>Monto</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id}>
              <td>
                <strong>{application.id.slice(0, 8)}</strong>
                <br />
                <span className="muted">{statusLabel(application.needType)}</span>
              </td>
              <td>{application.company?.legalName ?? application.companyId}</td>
              <td>{formatMoney(application.requestedAmount)}</td>
              <td>
                <span className="pill">{statusLabel(application.status)}</span>
              </td>
              <td>
                <div className="actions">
                  <Link className="secondary" href={`/applications/${application.id}`}>
                    Detalle
                  </Link>
                  <Link
                    className="secondary"
                    href={`/applications/${application.id}/documents`}
                  >
                    Documentos
                  </Link>
                  {role === 'internal_operator' ? (
                    <>
                      <Link
                        className="secondary"
                        href={`/applications/${application.id}/risk`}
                      >
                        Riesgo
                      </Link>
                      <Link
                        className="secondary"
                        href={`/applications/${application.id}/internal-file`}
                      >
                        Expediente
                      </Link>
                      <Link
                        className="secondary"
                        href={`/applications/${application.id}/decisions`}
                      >
                        Decisiones
                      </Link>
                    </>
                  ) : (
                    <Link
                      className="secondary"
                      href={`/applications/${application.id}/public-decision`}
                    >
                      Decision
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApplicationWorkspacePage({
  section,
}: {
  section: WorkspaceSection;
}) {
  const params = useParams();
  const rawId = params.id;
  const applicationId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? '';
  const roles: Role[] =
    section === 'risk' || section === 'internal-file' || section === 'decisions'
      ? ['internal_operator']
      : section === 'public-decision'
        ? ['applicant']
        : ['internal_operator', 'applicant'];

  return (
    <AuthedPage roles={roles}>
      {(session) => (
        <ApplicationWorkspace
          applicationId={applicationId}
          section={section}
          session={session}
        />
      )}
    </AuthedPage>
  );
}

function ApplicationWorkspace({
  applicationId,
  section,
  session,
}: {
  applicationId: string;
  section: WorkspaceSection;
  session: Session;
}) {
  const [application, setApplication] = useState<Application | null>(null);
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [history, setHistory] = useState<StatusHistoryItem[]>([]);
  const [publicDecision, setPublicDecision] = useState<PublicDecision | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    const [applicationData, historyResult, documentsResult] = await Promise.all([
      api.get<Application>(`/applications/${applicationId}`),
      api
        .get<StatusHistoryItem[]>(`/applications/${applicationId}/status-history`)
        .catch(() => []),
      api
        .get<ApplicationDocument[]>(`/applications/${applicationId}/documents`)
        .catch(() => []),
    ]);

    setApplication(applicationData);
    setHistory(historyResult);
    setDocuments(documentsResult);

    if (session.user.role === 'applicant') {
      setPublicDecision(
        await api.get<PublicDecision>(
          `/applications/${applicationId}/public-decision`,
        ),
      );
    }
  }, [applicationId, session.user.role]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(setError)
      .finally(() => setLoading(false));
  }, [load]);

  if (loading && !application) {
    return <main className="centered">Cargando solicitud...</main>;
  }

  if (!application) {
    return (
      <>
        <PageHeading title="Solicitud" />
        <ErrorBox error={error} />
      </>
    );
  }

  const role = session.user.role;
  const isOperator = role === 'internal_operator';

  return (
    <>
      <PageHeading
        title={`Solicitud ${application.id.slice(0, 8)}`}
        description={`${formatMoney(application.requestedAmount)} a ${application.desiredTermMonths} meses`}
        actions={<span className="pill">{statusLabel(application.status)}</span>}
      />
      <ErrorBox error={error} />
      <nav className="tabs">
        <Link href={`/applications/${application.id}`}>Detalle</Link>
        <Link href={`/applications/${application.id}/documents`}>Documentos</Link>
        {isOperator ? (
          <>
            <Link href={`/applications/${application.id}/risk`}>Riesgo</Link>
            <Link href={`/applications/${application.id}/internal-file`}>
              Expediente interno
            </Link>
            <Link href={`/applications/${application.id}/decisions`}>
              Decisiones
            </Link>
          </>
        ) : (
          <Link href={`/applications/${application.id}/public-decision`}>
            Decision publica
          </Link>
        )}
      </nav>
      {section === 'documents' ? (
        <DocumentsPanel
          applicationId={application.id}
          documents={documents}
          role={role}
          onReload={load}
        />
      ) : section === 'risk' && isOperator ? (
        <OperatorRiskPanel applicationId={application.id} />
      ) : section === 'internal-file' && isOperator ? (
        <InternalFilePanel applicationId={application.id} />
      ) : section === 'decisions' && isOperator ? (
        <DecisionsPanel applicationId={application.id} application={application} />
      ) : section === 'public-decision' ? (
        <PublicDecisionPanel decision={publicDecision} application={application} />
      ) : (
        <>
          <ApplicationSummary application={application} role={role} />
          <ApplicationEditForm
            application={application}
            role={role}
            onUpdated={load}
          />
          <FinancialInfoForm
            application={application}
            role={role}
            onUpdated={load}
          />
          {isOperator ? (
            <>
              <OperatorStatusPanel application={application} onUpdated={load} />
              <NeedValidationPanel application={application} onUpdated={load} />
            </>
          ) : publicDecision ? (
            <PublicDecisionPanel
              decision={publicDecision}
              application={application}
              compact
            />
          ) : null}
          <StatusHistoryPanel history={history} />
        </>
      )}
    </>
  );
}

function ApplicationSummary({
  application,
  role,
}: {
  application: Application;
  role: Role;
}) {
  return (
    <Section title="Resumen">
      <div className="grid">
        <div>
          <span className="muted">Empresa</span>
          <strong>{application.company?.legalName ?? application.companyId}</strong>
        </div>
        <div>
          <span className="muted">Necesidad</span>
          <strong>{statusLabel(application.needType)}</strong>
        </div>
        <div>
          <span className="muted">Monto</span>
          <strong>{formatMoney(application.requestedAmount)}</strong>
        </div>
        <div>
          <span className="muted">Plazo</span>
          <strong>{application.desiredTermMonths} meses</strong>
        </div>
      </div>
      <p>{application.fundingPurpose}</p>
      {role === 'internal_operator' && application.validatedNeedType ? (
        <div className="alert info">
          Necesidad validada: {statusLabel(application.validatedNeedType)}.{' '}
          {application.needTypeValidationNotes ?? ''}
        </div>
      ) : null}
    </Section>
  );
}

function ApplicationEditForm({
  application,
  role,
  onUpdated,
}: {
  application: Application;
  role: Role;
  onUpdated: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const disabled = role === 'applicant' && isApplicantLocked(application.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      await api.patch<Application>(`/applications/${application.id}`, {
        requestedAmount: readNumber(form, 'requestedAmount'),
        desiredTermMonths: Math.trunc(readNumber(form, 'desiredTermMonths')),
        fundingPurpose: readText(form, 'fundingPurpose'),
        urgencyLevel: readText(form, 'urgencyLevel'),
        needType: readText(form, 'needType'),
      });
      await onUpdated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Datos de solicitud"
      description={
        disabled
          ? 'La solicitud ya esta en analisis; el applicant no puede editar datos criticos.'
          : undefined
      }
    >
      <ErrorBox error={error} />
      <form key={application.updatedAt} onSubmit={submit}>
        <div className="form-grid">
          <Field label="Monto solicitado">
            <input
              disabled={disabled}
              name="requestedAmount"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={application.requestedAmount}
              required
            />
          </Field>
          <Field label="Plazo deseado">
            <input
              disabled={disabled}
              name="desiredTermMonths"
              type="number"
              min="1"
              defaultValue={application.desiredTermMonths}
              required
            />
          </Field>
          <Field label="Urgencia">
            <select
              disabled={disabled}
              name="urgencyLevel"
              defaultValue={application.urgencyLevel}
            >
              {urgencyLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Necesidad">
            <select
              disabled={disabled}
              name="needType"
              defaultValue={application.needType}
            >
              {needTypes.map((type) => (
                <option key={type} value={type}>
                  {statusLabel(type)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destino">
            <textarea
              disabled={disabled}
              name="fundingPurpose"
              minLength={5}
              defaultValue={application.fundingPurpose}
              required
            />
          </Field>
        </div>
        <div className="actions">
          <button type="submit" disabled={busy || disabled}>
            {busy ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function FinancialInfoForm({
  application,
  role,
  onUpdated,
}: {
  application: Application;
  role: Role;
  onUpdated: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const disabled = role === 'applicant' && isApplicantLocked(application.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      await api.patch<Application>(`/applications/${application.id}/financial-info`, {
        hasInvoices: optionalBoolean(form, 'hasInvoices'),
        hasExistingDebt: optionalBoolean(form, 'hasExistingDebt'),
        existingDebtAmount: optionalNumber(form, 'existingDebtAmount'),
        monthlyDebtPayment: optionalNumber(form, 'monthlyDebtPayment'),
        creditCheckAuthorized: optionalBoolean(form, 'creditCheckAuthorized'),
        creditHistoryStatus: optionalText(form, 'creditHistoryStatus'),
        hasCollateral: optionalBoolean(form, 'hasCollateral'),
        collateralType: optionalText(form, 'collateralType'),
        collateralEstimatedValue: optionalNumber(form, 'collateralEstimatedValue'),
        hasGuarantor: optionalBoolean(form, 'hasGuarantor'),
      });
      await onUpdated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Datos financieros">
      <ErrorBox error={error} />
      <form key={application.updatedAt} onSubmit={submit}>
        <div className="form-grid">
          <BooleanField
            label="Tiene facturas"
            name="hasInvoices"
            value={application.hasInvoices}
            disabled={disabled}
          />
          <BooleanField
            label="Tiene deuda vigente"
            name="hasExistingDebt"
            value={application.hasExistingDebt}
            disabled={disabled}
          />
          <Field label="Monto deuda vigente">
            <input
              disabled={disabled}
              name="existingDebtAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={application.existingDebtAmount ?? ''}
            />
          </Field>
          <Field label="Pago mensual deuda">
            <input
              disabled={disabled}
              name="monthlyDebtPayment"
              type="number"
              min="0"
              step="0.01"
              defaultValue={application.monthlyDebtPayment ?? ''}
            />
          </Field>
          <BooleanField
            label="Autoriza consulta crediticia"
            name="creditCheckAuthorized"
            value={application.creditCheckAuthorized}
            disabled={disabled}
          />
          <Field label="Historial crediticio">
            <select
              disabled={disabled}
              name="creditHistoryStatus"
              defaultValue={application.creditHistoryStatus ?? ''}
            >
              <option value="">Sin dato</option>
              {['unknown', 'good', 'regular', 'bad', 'not_available'].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
          </Field>
          <BooleanField
            label="Tiene garantia"
            name="hasCollateral"
            value={application.hasCollateral}
            disabled={disabled}
          />
          <Field label="Tipo de garantia">
            <input
              disabled={disabled}
              name="collateralType"
              defaultValue={application.collateralType ?? ''}
            />
          </Field>
          <Field label="Valor estimado garantia">
            <input
              disabled={disabled}
              name="collateralEstimatedValue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={application.collateralEstimatedValue ?? ''}
            />
          </Field>
          <BooleanField
            label="Tiene obligado solidario"
            name="hasGuarantor"
            value={application.hasGuarantor}
            disabled={disabled}
          />
        </div>
        <div className="actions">
          <button type="submit" disabled={busy || disabled}>
            {busy ? 'Guardando...' : 'Guardar datos financieros'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function BooleanField({
  label,
  name,
  value,
  disabled,
}: {
  label: string;
  name: string;
  value?: boolean | null;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        disabled={disabled}
        name={name}
        defaultValue={value === null || value === undefined ? '' : String(value)}
      >
        <option value="">Sin dato</option>
        <option value="true">Si</option>
        <option value="false">No</option>
      </select>
    </Field>
  );
}

function OperatorStatusPanel({
  application,
  onUpdated,
}: {
  application: Application;
  onUpdated: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      await api.patch<Application>(`/applications/${application.id}/status`, {
        status: readText(form, 'status'),
        comment: optionalText(form, 'comment'),
      });
      await onUpdated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Estado interno">
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Estado">
            <select name="status" defaultValue={application.status}>
              {applicationStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Comentario">
            <input name="comment" />
          </Field>
        </div>
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Actualizando...' : 'Actualizar estado'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function NeedValidationPanel({
  application,
  onUpdated,
}: {
  application: Application;
  onUpdated: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      await api.patch<Application>(
        `/applications/${application.id}/validated-need-type`,
        {
          validatedNeedType: readText(form, 'validatedNeedType'),
          notes: optionalText(form, 'notes'),
        },
      );
      await onUpdated();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Validacion de necesidad">
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Necesidad validada">
            <select
              name="validatedNeedType"
              defaultValue={application.validatedNeedType ?? application.needType}
            >
              {needTypes.map((type) => (
                <option key={type} value={type}>
                  {statusLabel(type)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notas">
            <textarea
              name="notes"
              defaultValue={application.needTypeValidationNotes ?? ''}
            />
          </Field>
        </div>
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Guardando...' : 'Guardar validacion'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function StatusHistoryPanel({ history }: { history: StatusHistoryItem[] }) {
  return (
    <Section title="Historial de estado">
      {history.length === 0 ? (
        <EmptyState>Sin historial visible.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Anterior</th>
                <th>Nuevo</th>
                <th>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.changedAt)}</td>
                  <td>{statusLabel(item.previousStatus)}</td>
                  <td>{statusLabel(item.newStatus)}</td>
                  <td>{item.comment ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function DocumentsPanel({
  applicationId,
  documents,
  role,
  onReload,
}: {
  applicationId: string;
  documents: ApplicationDocument[];
  role: Role;
  onReload: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function initialize() {
    setBusyId('initialize');
    setError(null);
    try {
      await api.post<ApplicationDocument[]>(
        `/applications/${applicationId}/documents/initialize`,
      );
      await onReload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>, documentId: string) {
    event.preventDefault();
    setBusyId(documentId);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      await api.post<ApplicationDocument>(
        `/application-documents/${documentId}/upload`,
        form,
      );
      event.currentTarget.reset();
      await onReload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function review(event: FormEvent<HTMLFormElement>, documentId: string) {
    event.preventDefault();
    setBusyId(documentId);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      const status = readText(form, 'status');
      const notes = optionalText(form, 'notes');

      if (status === 'rejected' && !notes) {
        throw new Error('El rechazo requiere motivo.');
      }

      await api.patch<ApplicationDocument>(
        `/application-documents/${documentId}/review`,
        { status, notes },
      );
      await onReload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function download(document: ApplicationDocument) {
    setBusyId(document.id);
    setError(null);
    try {
      await downloadFile(
        `/application-documents/${document.id}/download`,
        document.originalFilename ?? `${document.requirement.name}.pdf`,
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Section
      title="Documentos"
      description="Checklist documental, carga local, revision y descarga protegida por backend."
    >
      <ErrorBox error={error} />
      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={initialize}
          disabled={busyId === 'initialize'}
        >
          Inicializar checklist
        </button>
      </div>
      {documents.length === 0 ? (
        <EmptyState>No hay checklist inicializado.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Requisito</th>
                <th>Estado</th>
                <th>Archivo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <strong>{document.requirement.name}</strong>
                    <br />
                    <span className="muted">
                      {document.requirement.isRequired
                        ? 'Obligatorio'
                        : 'Opcional'}
                    </span>
                    {document.notes ? (
                      <>
                        <br />
                        <span className="muted">Notas: {document.notes}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <span className="pill">{statusLabel(document.status)}</span>
                    <br />
                    <span className="muted">{formatDate(document.reviewedAt)}</span>
                  </td>
                  <td>
                    {document.originalFilename ? (
                      <>
                        <strong>{document.originalFilename}</strong>
                        <br />
                        <span className="muted">
                          {document.mimeType ?? '-'} /{' '}
                          {document.fileSizeBytes ?? '-'} bytes
                        </span>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <div className="document-row">
                      <form onSubmit={(event) => upload(event, document.id)}>
                        <div className="inline-form">
                          <input name="file" type="file" required />
                          <button type="submit" disabled={busyId === document.id}>
                            {document.status === 'rejected'
                              ? 'Reemplazar'
                              : 'Subir'}
                          </button>
                        </div>
                      </form>
                      <div className="actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={!document.originalFilename || busyId === document.id}
                          onClick={() => download(document)}
                        >
                          Descargar
                        </button>
                      </div>
                      {role === 'internal_operator' ? (
                        <form onSubmit={(event) => review(event, document.id)}>
                          <div className="inline-form">
                            <select name="status" defaultValue={document.status}>
                              <option value="approved">approved</option>
                              <option value="rejected">rejected</option>
                              <option value="not_applicable">not_applicable</option>
                            </select>
                            <input name="notes" placeholder="Notas de revision" />
                            <button
                              type="submit"
                              disabled={busyId === document.id}
                            >
                              Revisar
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function PublicDecisionPanel({
  decision,
  application,
  compact,
}: {
  decision: PublicDecision | null;
  application: Application;
  compact?: boolean;
}) {
  if (!decision) {
    return (
      <Section title="Decision publica">
        <EmptyState>Solicitud en revision.</EmptyState>
      </Section>
    );
  }

  if (isNotPublished(decision)) {
    return (
      <Section title="Decision publica">
        <div className="alert info">
          {decision.message} Estado actual: {statusLabel(application.status)}.
        </div>
      </Section>
    );
  }

  return (
    <Section title={compact ? 'Decision publicada' : 'Decision publica'}>
      <div className="grid">
        <div>
          <span className="muted">Estado</span>
          <strong>{statusLabel(decision.decisionStatus)}</strong>
        </div>
        <div>
          <span className="muted">Producto</span>
          <strong>{decision.productName ?? '-'}</strong>
        </div>
        <div>
          <span className="muted">Monto</span>
          <strong>{formatMoney(decision.approvedAmount)}</strong>
        </div>
        <div>
          <span className="muted">Plazo</span>
          <strong>{decision.approvedTermMonths ?? '-'} meses</strong>
        </div>
        <div>
          <span className="muted">Pago mensual</span>
          <strong>{formatMoney(decision.estimatedMonthlyPayment)}</strong>
        </div>
        <div>
          <span className="muted">Fecha publicacion</span>
          <strong>{formatDate(decision.publishedAt)}</strong>
        </div>
      </div>
      <p>{decision.publicMessage}</p>
      <div className="alert warning">{decision.legend}</div>
    </Section>
  );
}

function OperatorRiskPanel({ applicationId }: { applicationId: string }) {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [matches, setMatches] = useState<ApplicationMatch[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => assessments.find((assessment) => assessment.id === selectedId) ?? null,
    [assessments, selectedId],
  );

  const loadAssessments = useCallback(async () => {
    const data = await api.get<RiskAssessment[]>(
      `/applications/${applicationId}/risk-assessments`,
    );
    setAssessments(data);
    setSelectedId((current) => current || data[0]?.id || '');
  }, [applicationId]);

  useEffect(() => {
    loadAssessments().catch(setError);
  }, [loadAssessments]);

  async function calculate() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<RiskAssessment>(
        `/applications/${applicationId}/risk-assessments`,
      );
      setSelectedId(result.id);
      await loadAssessments();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function loadMatches(riskAssessmentId: string) {
    setBusy(true);
    setError(null);
    try {
      setMatches(
        await api.get<ApplicationMatch[]>(
          `/risk-assessments/${riskAssessmentId}/matches`,
        ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function generateMatches() {
    if (!selectedId) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setMatches(
        await api.post<ApplicationMatch[]>(
          `/risk-assessments/${selectedId}/matches`,
        ),
      );
      await loadAssessments();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section title="Riesgo interno">
        <ErrorBox error={error} />
        <div className="actions">
          <button type="button" onClick={calculate} disabled={busy}>
            Calcular riesgo
          </button>
          <button
            type="button"
            className="secondary"
            onClick={generateMatches}
            disabled={busy || !selectedId}
          >
            Generar matching
          </button>
        </div>
        {assessments.length === 0 ? (
          <EmptyState>No hay analisis de riesgo.</EmptyState>
        ) : (
          <>
            <Field label="Analisis">
              <select
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setMatches([]);
                }}
              >
                {assessments.map((assessment) => (
                  <option key={assessment.id} value={assessment.id}>
                    {formatDate(assessment.calculatedAt)} -{' '}
                    {statusLabel(assessment.riskLevel)}
                  </option>
                ))}
              </select>
            </Field>
            {selected ? (
              <div className="grid">
                <div className="stat">
                  <span>Risk score</span>
                  <strong>{selected.riskScore}</strong>
                </div>
                <div className="stat">
                  <span>Risk level</span>
                  <strong>{selected.riskLevel}</strong>
                </div>
                <div className="stat">
                  <span>Documentos completos</span>
                  <strong>{selected.documentCompletionPercentage}%</strong>
                </div>
                <div className="stat">
                  <span>DSCR</span>
                  <strong>{selected.debtServiceCoverageRatio}</strong>
                </div>
              </div>
            ) : null}
            {selected ? (
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => loadMatches(selected.id)}
                >
                  Consultar matches
                </button>
              </div>
            ) : null}
          </>
        )}
      </Section>
      <MatchesSection matches={matches.length ? matches : selected?.matches ?? []} />
      {selected ? (
        <Section title="Snapshot interno">
          <pre className="json-block">{jsonBlock(selected.inputSnapshot)}</pre>
        </Section>
      ) : null}
    </>
  );
}

function MatchesSection({ matches }: { matches: ApplicationMatch[] }) {
  return (
    <Section title="Matching interno">
      {matches.length === 0 ? (
        <EmptyState>No hay matches para mostrar.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Score</th>
                <th>Tasa</th>
                <th>Pago</th>
                <th>DSCR</th>
                <th>Razones internas</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => (
                <tr key={match.id}>
                  <td>{match.financialProduct?.name ?? match.financialProductId}</td>
                  <td>{match.compatibilityScore}</td>
                  <td>{match.estimatedAnnualRateUsed ?? '-'}</td>
                  <td>{formatMoney(match.estimatedMonthlyPayment)}</td>
                  <td>{match.debtServiceCoverageRatio ?? '-'}</td>
                  <td>
                    <pre className="json-block">{jsonBlock(match.reason)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function InternalFilePanel({ applicationId }: { applicationId: string }) {
  const [file, setFile] = useState<InternalFile | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api
      .get<InternalFile>(`/applications/${applicationId}/internal-file`)
      .then(setFile)
      .catch(setError);
  }, [applicationId]);

  return (
    <>
      <ErrorBox error={error} />
      {!file ? (
        <EmptyState>Cargando expediente interno.</EmptyState>
      ) : (
        <>
          <ApplicationSummary application={file.application} role="internal_operator" />
          <Section title="Empresa">
            <div className="grid">
              <div>
                <span className="muted">Razon social</span>
                <strong>{file.company.legalName}</strong>
              </div>
              <div>
                <span className="muted">RFC</span>
                <strong>{file.company.rfc}</strong>
              </div>
              <div>
                <span className="muted">Ingresos</span>
                <strong>{formatMoney(file.company.monthlyRevenue)}</strong>
              </div>
              <div>
                <span className="muted">Gastos</span>
                <strong>{formatMoney(file.company.monthlyExpenses)}</strong>
              </div>
            </div>
          </Section>
          <DocumentsPanel
            applicationId={applicationId}
            documents={file.documents}
            role="internal_operator"
            onReload={async () => {
              setFile(
                await api.get<InternalFile>(
                  `/applications/${applicationId}/internal-file`,
                ),
              );
            }}
          />
          <Section title="Analisis y matches">
            <pre className="json-block">
              {jsonBlock(
                file.riskAssessments.map((assessment) => ({
                  id: assessment.id,
                  riskScore: assessment.riskScore,
                  riskLevel: assessment.riskLevel,
                  matches: assessment.matches ?? [],
                })),
              )}
            </pre>
          </Section>
          <Section title="Decisiones internas">
            <pre className="json-block">{jsonBlock(file.decisions)}</pre>
          </Section>
          <StatusHistoryPanel history={file.statusHistory} />
        </>
      )}
    </>
  );
}

function DecisionsPanel({
  applicationId,
  application,
}: {
  applicationId: string;
  application: Application;
}) {
  const [decisions, setDecisions] = useState<ApplicationDecision[]>([]);
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [selectedRiskId, setSelectedRiskId] = useState('');
  const [matches, setMatches] = useState<ApplicationMatch[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [decisionData, assessmentData] = await Promise.all([
      api.get<ApplicationDecision[]>(`/applications/${applicationId}/decisions`),
      api.get<RiskAssessment[]>(`/applications/${applicationId}/risk-assessments`),
    ]);
    setDecisions(decisionData);
    setAssessments(assessmentData);
    setSelectedRiskId((current) => current || assessmentData[0]?.id || '');
  }, [applicationId]);

  useEffect(() => {
    load().catch(setError);
  }, [load]);

  useEffect(() => {
    if (!selectedRiskId) {
      setMatches([]);
      return;
    }

    api
      .get<ApplicationMatch[]>(`/risk-assessments/${selectedRiskId}/matches`)
      .then(setMatches)
      .catch(() => setMatches([]));
  }, [selectedRiskId]);

  async function createDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      await api.post<ApplicationDecision>(`/applications/${applicationId}/decisions`, {
        riskAssessmentId: readText(form, 'riskAssessmentId'),
        selectedMatchId: optionalText(form, 'selectedMatchId'),
        decisionStatus: readText(form, 'decisionStatus'),
        approvedAmount: optionalNumber(form, 'approvedAmount'),
        approvedTermMonths: optionalInteger(form, 'approvedTermMonths'),
        estimatedMonthlyPayment: optionalNumber(form, 'estimatedMonthlyPayment'),
        publicMessage: readText(form, 'publicMessage'),
        internalNotes: optionalText(form, 'internalNotes'),
      });
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function publish(decisionId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch<ApplicationDecision>(
        `/application-decisions/${decisionId}/publish`,
      );
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function closeApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      await api.patch(`/applications/${applicationId}/close`, {
        comment: optionalText(form, 'comment'),
      });
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section title="Crear decision oficial">
        <ErrorBox error={error} />
        {assessments.length === 0 ? (
          <EmptyState>Primero calcula riesgo para esta solicitud.</EmptyState>
        ) : (
          <form onSubmit={createDecision}>
            <div className="form-grid">
              <Field label="Analisis de riesgo">
                <select
                  name="riskAssessmentId"
                  value={selectedRiskId}
                  onChange={(event) => setSelectedRiskId(event.target.value)}
                  required
                >
                  {assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {formatDate(assessment.calculatedAt)} -{' '}
                      {assessment.riskLevel}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Match seleccionado">
                <select name="selectedMatchId" defaultValue="">
                  <option value="">Sin match</option>
                  {matches.map((match) => (
                    <option key={match.id} value={match.id}>
                      {match.financialProduct?.name ?? match.financialProductId} -{' '}
                      {match.compatibilityScore}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estado de decision">
                <select name="decisionStatus" defaultValue="under_review">
                  {decisionStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Monto aprobado">
                <input name="approvedAmount" type="number" min="0.01" step="0.01" />
              </Field>
              <Field label="Plazo aprobado">
                <input name="approvedTermMonths" type="number" min="1" />
              </Field>
              <Field label="Pago mensual estimado">
                <input
                  name="estimatedMonthlyPayment"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </Field>
              <Field label="Mensaje publico">
                <textarea name="publicMessage" required minLength={1} />
              </Field>
              <Field label="Notas internas">
                <textarea name="internalNotes" />
              </Field>
            </div>
            <div className="actions">
              <button type="submit" disabled={busy}>
                {busy ? 'Guardando...' : 'Crear decision'}
              </button>
            </div>
          </form>
        )}
      </Section>
      <Section title="Decisiones">
        {decisions.length === 0 ? (
          <EmptyState>No hay decisiones.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>Publicacion</th>
                  <th>Publico</th>
                  <th>Notas internas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td>
                      <strong>{statusLabel(decision.decisionStatus)}</strong>
                      <br />
                      <span className="muted">
                        {formatMoney(decision.approvedAmount)} /{' '}
                        {decision.approvedTermMonths ?? '-'} meses
                      </span>
                    </td>
                    <td>
                      {decision.isPublishedToApplicant
                        ? `Publicada ${formatDate(decision.publishedAt)}`
                        : 'No publicada'}
                    </td>
                    <td>{decision.publicMessage}</td>
                    <td>{decision.internalNotes ?? '-'}</td>
                    <td>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => publish(decision.id)}
                      >
                        Publicar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section
        title="Cerrar solicitud"
        description={`Estado actual: ${statusLabel(application.status)}.`}
      >
        <form onSubmit={closeApplication}>
          <div className="inline-form">
            <input name="comment" placeholder="Comentario de cierre" />
            <button type="submit" className="danger" disabled={busy}>
              Cerrar solicitud
            </button>
          </div>
        </form>
      </Section>
    </>
  );
}

export function FinancialProductsPage() {
  const [products, setProducts] = useState<FinancialProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [rules, setRules] = useState<ProductRule[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const loadProducts = useCallback(async () => {
    const data = await api.get<FinancialProduct[]>('/financial-products');
    setProducts(data);
    setSelectedProductId((current) => current || data[0]?.id || '');
  }, []);

  const loadRules = useCallback(async (productId: string) => {
    if (!productId) {
      setRules([]);
      return;
    }

    setRules(await api.get<ProductRule[]>(`/financial-products/${productId}/rules`));
  }, []);

  useEffect(() => {
    loadProducts().catch(setError);
  }, [loadProducts]);

  useEffect(() => {
    loadRules(selectedProductId).catch(setError);
  }, [loadRules, selectedProductId]);

  return (
    <AuthedPage roles={['internal_operator']}>
      {() => {
        async function createProduct(event: FormEvent<HTMLFormElement>) {
          event.preventDefault();
          setBusy(true);
          setError(null);

          try {
            const form = new FormData(event.currentTarget);
            await api.post<FinancialProduct>('/financial-products', {
              name: readText(form, 'name'),
              description: optionalText(form, 'description'),
              minAmount: readNumber(form, 'minAmount'),
              maxAmount: readNumber(form, 'maxAmount'),
              minYearsOperating: readNumber(form, 'minYearsOperating'),
              maxResponseDays: optionalInteger(form, 'maxResponseDays'),
              estimatedAnnualRate: optionalNumber(form, 'estimatedAnnualRate'),
              requiresInvoices: checked(form, 'requiresInvoices'),
              requiresBankStatements: checked(form, 'requiresBankStatements'),
              requiresCollateral: checked(form, 'requiresCollateral'),
              idealFor: optionalText(form, 'idealFor'),
              isActive: checked(form, 'isActive'),
            });
            event.currentTarget.reset();
            await loadProducts();
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }

        async function createRule(event: FormEvent<HTMLFormElement>) {
          event.preventDefault();
          setBusy(true);
          setError(null);

          try {
            const form = new FormData(event.currentTarget);
            await api.post<ProductRule>('/product-rules', {
              financialProductId: selectedProductId,
              ruleField: readText(form, 'ruleField'),
              operator: readText(form, 'operator'),
              conditionValue: readText(form, 'conditionValue'),
              conditionValueTo: optionalText(form, 'conditionValueTo'),
              scoreWeight: Math.trunc(readNumber(form, 'scoreWeight')),
              isActive: checked(form, 'isActive'),
            });
            event.currentTarget.reset();
            await loadRules(selectedProductId);
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }

        async function toggleProduct(product: FinancialProduct) {
          setBusy(true);
          setError(null);
          try {
            await api.patch<FinancialProduct>(`/financial-products/${product.id}`, {
              isActive: !product.isActive,
            });
            await loadProducts();
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }

        async function toggleRule(rule: ProductRule) {
          setBusy(true);
          setError(null);
          try {
            await api.patch<ProductRule>(`/product-rules/${rule.id}`, {
              isActive: !rule.isActive,
            });
            await loadRules(selectedProductId);
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }

        return (
          <>
            <PageHeading
              title="Productos y reglas"
              description="Catalogo interno de productos financieros simulados."
            />
            <ErrorBox error={error} />
            <Section title="Nuevo producto">
              <form onSubmit={createProduct}>
                <div className="form-grid">
                  <Field label="Nombre">
                    <input name="name" minLength={2} required />
                  </Field>
                  <Field label="Monto minimo">
                    <input
                      name="minAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </Field>
                  <Field label="Monto maximo">
                    <input
                      name="maxAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </Field>
                  <Field label="Anios operando minimos">
                    <input
                      name="minYearsOperating"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                    />
                  </Field>
                  <Field label="Dias respuesta maximos">
                    <input name="maxResponseDays" type="number" min="1" />
                  </Field>
                  <Field label="Tasa anual estimada">
                    <input
                      name="estimatedAnnualRate"
                      type="number"
                      min="0.01"
                      step="0.01"
                    />
                  </Field>
                  <Field label="Ideal para">
                    <select name="idealFor" defaultValue="">
                      <option value="">Sin preferencia</option>
                      {needTypes.map((type) => (
                        <option key={type} value={type}>
                          {statusLabel(type)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Descripcion">
                    <textarea name="description" />
                  </Field>
                </div>
                <div className="actions">
                  <label>
                    <input name="requiresInvoices" type="checkbox" /> Requiere
                    facturas
                  </label>
                  <label>
                    <input name="requiresBankStatements" type="checkbox" /> Requiere
                    estados bancarios
                  </label>
                  <label>
                    <input name="requiresCollateral" type="checkbox" /> Requiere
                    garantia
                  </label>
                  <label>
                    <input name="isActive" type="checkbox" defaultChecked /> Activo
                  </label>
                </div>
                <div className="actions">
                  <button type="submit" disabled={busy}>
                    Crear producto
                  </button>
                </div>
              </form>
            </Section>
            <Section title="Productos">
              {products.length === 0 ? (
                <EmptyState>No hay productos.</EmptyState>
              ) : (
                <>
                  <Field label="Producto seleccionado para reglas">
                    <select
                      value={selectedProductId}
                      onChange={(event) => setSelectedProductId(event.target.value)}
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Rango</th>
                          <th>Tasa</th>
                          <th>Activo</th>
                          <th>Accion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((product) => (
                          <tr key={product.id}>
                            <td>{product.name}</td>
                            <td>
                              {formatMoney(product.minAmount)} -{' '}
                              {formatMoney(product.maxAmount)}
                            </td>
                            <td>{product.estimatedAnnualRate ?? '-'}</td>
                            <td>{product.isActive ? 'Si' : 'No'}</td>
                            <td>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => toggleProduct(product)}
                                disabled={busy}
                              >
                                {product.isActive ? 'Desactivar' : 'Activar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Section>
            <Section title="Nueva regla">
              {!selectedProductId ? (
                <EmptyState>Selecciona un producto.</EmptyState>
              ) : (
                <form onSubmit={createRule}>
                  <div className="form-grid">
                    <Field label="Campo">
                      <select name="ruleField">
                        {ruleFields.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Operador">
                      <select name="operator">
                        {ruleOperators.map((operator) => (
                          <option key={operator} value={operator}>
                            {operator}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Valor">
                      <input name="conditionValue" required />
                    </Field>
                    <Field label="Valor hasta">
                      <input name="conditionValueTo" />
                    </Field>
                    <Field label="Peso">
                      <input
                        name="scoreWeight"
                        type="number"
                        min="-100"
                        max="100"
                        required
                      />
                    </Field>
                  </div>
                  <div className="actions">
                    <label>
                      <input name="isActive" type="checkbox" defaultChecked /> Activa
                    </label>
                    <button type="submit" disabled={busy}>
                      Crear regla
                    </button>
                  </div>
                </form>
              )}
            </Section>
            <Section title="Reglas del producto">
              {rules.length === 0 ? (
                <EmptyState>No hay reglas para este producto.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Campo</th>
                        <th>Condicion</th>
                        <th>Peso</th>
                        <th>Activo</th>
                        <th>Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => (
                        <tr key={rule.id}>
                          <td>{rule.ruleField}</td>
                          <td>
                            {rule.operator} {rule.conditionValue}{' '}
                            {rule.conditionValueTo
                              ? `- ${rule.conditionValueTo}`
                              : ''}
                          </td>
                          <td>{rule.scoreWeight}</td>
                          <td>{rule.isActive ? 'Si' : 'No'}</td>
                          <td>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => toggleRule(rule)}
                              disabled={busy}
                            >
                              {rule.isActive ? 'Desactivar' : 'Activar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        );
      }}
    </AuthedPage>
  );
}

export function AuditLogsPage() {
  return (
    <AuthedPage roles={['internal_operator']}>
      {() => <AuditLogsContent />}
    </AuthedPage>
  );
}

function AuditLogsContent() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuditLog[]>('/audit-logs')
      .then(setLogs)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeading
        title="Auditoria"
        description="Ultimas acciones sensibles registradas para revision interna."
      />
      <ErrorBox error={error} />
      <Section title="Eventos recientes">
        {loading ? (
          <EmptyState>Cargando auditoria...</EmptyState>
        ) : logs.length === 0 ? (
          <EmptyState>No hay eventos de auditoria.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Accion</th>
                  <th>Entidad</th>
                  <th>Usuario</th>
                  <th>Valores</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.createdAt)}</td>
                    <td>{log.action}</td>
                    <td>
                      <strong>{log.entityName}</strong>
                      <br />
                      <span className="muted">{log.entityId ?? '-'}</span>
                    </td>
                    <td>
                      {log.user ? (
                        <>
                          <strong>{log.user.fullName}</strong>
                          <br />
                          <span className="muted">
                            {log.user.email} / {log.user.role}
                          </span>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <pre className="json-block">
                        {jsonBlock({
                          oldValues: log.oldValues,
                          newValues: log.newValues,
                        })}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
