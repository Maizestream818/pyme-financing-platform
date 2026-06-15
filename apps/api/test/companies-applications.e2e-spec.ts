import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://pyme:pyme_local_password@localhost:5432/pyme_financing_test?schema=public';

const DEMO_PASSWORD = 'Password123!';

describe('Empresas y solicitudes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let operatorToken: string;
  let applicantAToken: string;
  let applicantBToken: string;
  let applicantAId: string;
  let applicantBId: string;
  let companyAId: string;
  let companyBId: string;
  let applicationAId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test_secret_fase_3';
    process.env.JWT_EXPIRES_IN = '1h';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    await resetPhase3Data();
    await seedUsers();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    operatorToken = await login('operador@demo.com');
    applicantAToken = await login('applicant-a@demo.com');
    applicantBToken = await login('applicant-b@demo.com');
  });

  afterAll(async () => {
    await resetPhase3Data();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('crea empresa applicant usando applicant_user_id desde JWT e ignora ownership arbitrario', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .set('Authorization', `Bearer ${applicantAToken}`)
      .set('x-request-id', 'fase3-company-create')
      .send({
        legalName: 'Comercial Alpha Persona Fisica',
        tradeName: 'Comercial Alpha',
        rfc: 'MORA900101ABC',
        businessType: 'pfae',
        sector: 'Comercio',
        yearsOperating: 3,
        monthlyRevenue: 120000,
        monthlyExpenses: 80000,
        employeeCount: 8,
        contactEmail: 'contacto@alpha.com',
        applicantUserId: applicantBId,
      })
      .expect(201);

    expect(response.body.success).toBeUndefined();
    expect(response.body.meta.requestId).toBe('fase3-company-create');
    expect(response.body.data.applicantUserId).toBeUndefined();
    companyAId = response.body.data.id;

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyAId },
    });

    expect(company.applicantUserId).toBe(applicantAId);
    expect(company.createdByUserId).toBe(applicantAId);
  });

  it('rechaza RFC duplicado', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        legalName: 'RFC Duplicado',
        rfc: 'MORA900101ABC',
        businessType: 'pfae',
        sector: 'Servicios',
        yearsOperating: 1,
        monthlyRevenue: 50000,
        monthlyExpenses: 25000,
      })
      .expect(409);

    expect(response.body.error.code).toBe('DUPLICATE_RESOURCE');
  });

  it('permite empresa interna sin applicant_user_id y operador ve todas', async () => {
    const internalCompany = await request(app.getHttpServer())
      .post('/api/companies')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        legalName: 'Operaciones Internas SA',
        rfc: 'OPI900101AB1',
        businessType: 'persona_moral',
        sector: 'Servicios',
        yearsOperating: 5,
        monthlyRevenue: 300000,
        monthlyExpenses: 180000,
      })
      .expect(201);

    expect(internalCompany.body.data.applicantUserId).toBeNull();

    const applicantBCompany = await request(app.getHttpServer())
      .post('/api/companies')
      .set('Authorization', `Bearer ${applicantBToken}`)
      .send({
        legalName: 'Comercial Beta Persona Fisica',
        rfc: 'GOME900101ABC',
        businessType: 'pfae',
        sector: 'Comercio',
        yearsOperating: 2,
        monthlyRevenue: 90000,
        monthlyExpenses: 45000,
      })
      .expect(201);

    companyBId = applicantBCompany.body.data.id;

    const operatorCompanies = await request(app.getHttpServer())
      .get('/api/companies')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(operatorCompanies.body.data).toHaveLength(3);

    const applicantCompanies = await request(app.getHttpServer())
      .get('/api/companies')
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(applicantCompanies.body.data.map((item: { id: string }) => item.id)).toEqual([
      companyAId,
    ]);
  });

  it('bloquea acceso cruzado de applicant a empresa ajena', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/companies/${companyBId}`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('crea solicitudes solo sobre empresa propia y filtra listados por ownership', async () => {
    const forbidden = await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        companyId: companyBId,
        requestedAmount: 100000,
        desiredTermMonths: 12,
        fundingPurpose: 'Capital para compra de inventario.',
        urgencyLevel: 'medium',
        needType: 'working_capital',
      })
      .expect(403);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const created = await request(app.getHttpServer())
      .post('/api/applications')
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        companyId: companyAId,
        requestedAmount: 250000,
        desiredTermMonths: 18,
        fundingPurpose: 'Capital para compra de inventario y pago a proveedores.',
        urgencyLevel: 'medium',
        needType: 'working_capital',
      })
      .expect(201);

    applicationAId = created.body.data.id;
    expect(created.body.data.status).toBe('draft');
    expect(created.body.data.createdByUserId).toBeUndefined();

    const applicantApplications = await request(app.getHttpServer())
      .get('/api/applications')
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(
      applicantApplications.body.data.map((item: { id: string }) => item.id),
    ).toEqual([applicationAId]);

    const companyApplications = await request(app.getHttpServer())
      .get(`/api/companies/${companyAId}/applications`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(companyApplications.body.data).toHaveLength(1);
    expect(companyApplications.body.data[0].id).toBe(applicationAId);

    const operatorApplications = await request(app.getHttpServer())
      .get('/api/applications')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(operatorApplications.body.data).toHaveLength(1);
    expect(operatorApplications.body.data[0].createdByUserId).toBe(applicantAId);
  });

  it('actualiza datos financieros y valida deuda condicional', async () => {
    const invalidDebt = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/financial-info`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        hasExistingDebt: true,
      })
      .expect(400);

    expect(invalidDebt.body.error.code).toBe('VALIDATION_ERROR');

    const updated = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/financial-info`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        hasInvoices: false,
        hasExistingDebt: true,
        existingDebtAmount: 50000,
        monthlyDebtPayment: 6000,
        creditCheckAuthorized: true,
        creditHistoryStatus: 'good',
        hasCollateral: true,
        collateralType: 'Vehiculo utilitario',
        collateralEstimatedValue: 180000,
        hasGuarantor: false,
      })
      .expect(200);

    expect(updated.body.data).toMatchObject({
      hasExistingDebt: true,
      existingDebtAmount: '50000',
      monthlyDebtPayment: '6000',
      creditHistoryStatus: 'good',
      hasCollateral: true,
      collateralType: 'Vehiculo utilitario',
      collateralEstimatedValue: '180000',
    });
  });

  it('permite validar necesidad solo al operador y audita la accion', async () => {
    const forbidden = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/validated-need-type`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        validatedNeedType: 'equipment',
        notes: 'Intento applicant.',
      })
      .expect(403);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const validated = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/validated-need-type`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        validatedNeedType: 'equipment',
        notes: 'El uso declarado corresponde a compra de equipo.',
      })
      .expect(200);

    expect(validated.body.data).toMatchObject({
      validatedNeedType: 'equipment',
      needTypeValidatedByUserId: expect.any(String),
      needTypeValidationNotes: 'El uso declarado corresponde a compra de equipo.',
    });
    expect(validated.body.data.needTypeValidatedAt).toBeDefined();

    const applicantView = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(applicantView.body.data.validatedNeedType).toBeUndefined();
    expect(applicantView.body.data.needTypeValidationNotes).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'validate_need_type',
        entityName: 'financing_applications',
        entityId: applicationAId,
      },
    });

    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.newValues)).not.toContain('password');
  });

  it('rechaza transicion invalida y bloquea edicion applicant despues de ready_for_analysis', async () => {
    const invalidTransition = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: 'matched',
        comment: 'No debe saltar de draft a matched.',
      })
      .expect(400);

    expect(invalidTransition.body.error.code).toBe('INVALID_STATE_TRANSITION');

    const ready = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: 'ready_for_analysis',
        comment: 'Datos minimos listos para analisis.',
      })
      .expect(200);

    expect(ready.body.data.status).toBe('ready_for_analysis');

    const blockedApplicationEdit = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        requestedAmount: 300000,
      })
      .expect(400);

    expect(blockedApplicationEdit.body.error.code).toBe(
      'INVALID_STATE_TRANSITION',
    );

    const blockedCompanyEdit = await request(app.getHttpServer())
      .patch(`/api/companies/${companyAId}`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        monthlyRevenue: 150000,
      })
      .expect(400);

    expect(blockedCompanyEdit.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('expone historial completo al operador y version limitada al applicant', async () => {
    const operatorHistory = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/status-history`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(operatorHistory.body.data.map((item: { newStatus: string }) => item.newStatus)).toEqual([
      'draft',
      'ready_for_analysis',
    ]);
    expect(operatorHistory.body.data[1].comment).toBe(
      'Datos minimos listos para analisis.',
    );
    expect(operatorHistory.body.data[1].changedByUserId).toBeDefined();

    const applicantHistory = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/status-history`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(applicantHistory.body.data.map((item: { newStatus: string }) => item.newStatus)).toEqual([
      'draft',
      'ready_for_analysis',
    ]);
    expect(applicantHistory.body.data[1].comment).toBeUndefined();
    expect(applicantHistory.body.data[1].changedByUserId).toBeUndefined();
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  async function resetPhase3Data() {
    await prisma.auditLog.deleteMany();
    await prisma.applicationDecision.deleteMany();
    await prisma.applicationMatch.deleteMany();
    await prisma.riskAssessment.deleteMany();
    await prisma.applicationDocument.deleteMany();
    await prisma.applicationStatusHistory.deleteMany();
    await prisma.financingApplication.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  }

  async function seedUsers() {
    const [internalOperatorRole, applicantRole] = await Promise.all([
      prisma.role.create({
        data: {
          name: 'internal_operator',
          description: 'Operador interno de pruebas.',
          isActive: true,
        },
      }),
      prisma.role.create({
        data: {
          name: 'applicant',
          description: 'Applicant de pruebas.',
          isActive: true,
        },
      }),
    ]);

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const operator = await prisma.user.create({
      data: {
        roleId: internalOperatorRole.id,
        fullName: 'Operador Demo',
        email: 'operador@demo.com',
        passwordHash,
        isActive: true,
      },
    });

    const applicantA = await prisma.user.create({
      data: {
        roleId: applicantRole.id,
        fullName: 'Applicant A',
        email: 'applicant-a@demo.com',
        passwordHash,
        isActive: true,
      },
    });

    const applicantB = await prisma.user.create({
      data: {
        roleId: applicantRole.id,
        fullName: 'Applicant B',
        email: 'applicant-b@demo.com',
        passwordHash,
        isActive: true,
      },
    });

    expect(operator.id).toBeDefined();
    applicantAId = applicantA.id;
    applicantBId = applicantB.id;
  }
});
