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

describe('Riesgo y matching (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let operatorToken: string;
  let applicantToken: string;
  let operatorId: string;
  let applicantId: string;
  let applicationWithValidatedNeedId: string;
  let applicationWithoutValidatedNeedId: string;
  let applicationMissingDebtId: string;
  let applicationWithoutDocumentsId: string;
  let riskAssessmentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test_secret_fase_6';
    process.env.JWT_EXPIRES_IN = '1h';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    await resetRiskData();
    await seedRiskData();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    operatorToken = await login('operador@demo.com');
    applicantToken = await login('applicant@demo.com');
  });

  afterAll(async () => {
    await resetRiskData();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('bloquea a applicant en riesgo y matching interno', async () => {
    const createRisk = await request(app.getHttpServer())
      .post(`/api/applications/${applicationWithValidatedNeedId}/risk-assessments`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(403);

    expect(createRisk.body.error.code).toBe('FORBIDDEN');

    const listRisk = await request(app.getHttpServer())
      .get(`/api/applications/${applicationWithValidatedNeedId}/risk-assessments`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(403);

    expect(listRisk.body.error.code).toBe('FORBIDDEN');

    const fakeRiskId = '00000000-0000-4000-8000-000000000001';
    const listMatches = await request(app.getHttpServer())
      .get(`/api/risk-assessments/${fakeRiskId}/matches`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(403);

    expect(listMatches.body.error.code).toBe('FORBIDDEN');
  });

  it('rechaza riesgo con datos minimos incompletos o sin documentos obligatorios aplicables', async () => {
    const missingDebt = await request(app.getHttpServer())
      .post(`/api/applications/${applicationMissingDebtId}/risk-assessments`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);

    expect(missingDebt.body.error.code).toBe('RISK_PRECONDITION_FAILED');
    expect(missingDebt.body.error.details).toContainEqual({
      field: 'hasExistingDebt',
      issue: 'required_before_risk_analysis',
    });

    const missingDocuments = await request(app.getHttpServer())
      .post(`/api/applications/${applicationWithoutDocumentsId}/risk-assessments`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);

    expect(missingDocuments.body.error.code).toBe('RISK_PRECONDITION_FAILED');
    expect(missingDocuments.body.error.details).toContainEqual({
      field: 'documents',
      issue: 'required_applicable_documents_missing',
    });
  });

  it('calcula riesgo, avance documental, snapshot, auditoria e historial', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/applications/${applicationWithValidatedNeedId}/risk-assessments`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-request-id', 'fase6-risk')
      .expect(201);

    expect(response.body.success).toBeUndefined();
    expect(response.body.meta.requestId).toBe('fase6-risk');
    expect(response.body.data.applicationId).toBe(applicationWithValidatedNeedId);
    expect(Number(response.body.data.documentCompletionPercentage)).toBe(50);
    expect(Number(response.body.data.riskScore)).toBeGreaterThanOrEqual(0);
    expect(Number(response.body.data.riskScore)).toBeLessThanOrEqual(100);
    expect(response.body.data.riskLevel).toBe('low');
    expect(response.body.data.inputSnapshot.documents).toMatchObject({
      requiredApplicableDocuments: 2,
      approvedRequiredApplicableDocuments: 1,
      notApplicableRequiredDocuments: 1,
    });
    riskAssessmentId = response.body.data.id;

    const savedApplication = await prisma.financingApplication.findUniqueOrThrow({
      where: { id: applicationWithValidatedNeedId },
    });
    expect(savedApplication.status).toBe('analyzed');

    const history = await prisma.applicationStatusHistory.findFirst({
      where: {
        applicationId: applicationWithValidatedNeedId,
        previousStatus: 'ready_for_analysis',
        newStatus: 'analyzed',
      },
    });
    expect(history).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'calculate_risk',
        entityName: 'risk_assessments',
        entityId: riskAssessmentId,
      },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.newValues)).not.toContain('password');

    await request(app.getHttpServer())
      .post(`/api/applications/${applicationWithValidatedNeedId}/risk-assessments`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    const count = await prisma.riskAssessment.count({
      where: { applicationId: applicationWithValidatedNeedId },
    });
    expect(count).toBe(2);
  });

  it('consulta analisis por solicitud y detalle solo como operador', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/applications/${applicationWithValidatedNeedId}/risk-assessments`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0].riskScore).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/risk-assessments/${riskAssessmentId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(detail.body.data.id).toBe(riskAssessmentId);
    expect(detail.body.data.debtServiceCoverageRatio).toBeDefined();

    const applicantDetail = await request(app.getHttpServer())
      .get(`/api/risk-assessments/${riskAssessmentId}`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(403);

    expect(applicantDetail.body.error.code).toBe('FORBIDDEN');
  });

  it('genera matching con validated_need_type, descarta productos y no crea decisiones', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/risk-assessments/${riskAssessmentId}/matches`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    expect(response.body.data.effectiveNeedType).toBe('equipment');
    expect(response.body.data.matches.length).toBeGreaterThan(0);
    expect(
      response.body.data.matches.map(
        (match: { financialProduct: { name: string } }) =>
          match.financialProduct.name,
      ),
    ).toContain('Arrendamiento');
    expect(
      response.body.data.matches.map(
        (match: { financialProduct: { name: string } }) =>
          match.financialProduct.name,
      ),
    ).not.toContain('Factoraje');
    expect(
      response.body.data.excludedProducts.map(
        (product: { productName: string }) => product.productName,
      ),
    ).toEqual(expect.arrayContaining(['Factoraje']));

    const savedMatches = await prisma.applicationMatch.findMany({
      where: { riskAssessmentId },
    });
    expect(savedMatches).toHaveLength(response.body.data.matches.length);
    expect(
      savedMatches.every((match) => match.riskAssessmentId === riskAssessmentId),
    ).toBe(true);

    const updatedApplication =
      await prisma.financingApplication.findUniqueOrThrow({
        where: { id: applicationWithValidatedNeedId },
      });
    expect(updatedApplication.status).toBe('matched');

    const decisionCount = await prisma.applicationDecision.count();
    expect(decisionCount).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'generate_matches',
        entityName: 'risk_assessments',
        entityId: riskAssessmentId,
      },
    });
    expect(audit).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/api/risk-assessments/${riskAssessmentId}/matches`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(list.body.data).toHaveLength(response.body.data.matches.length);

    await request(app.getHttpServer())
      .post(`/api/risk-assessments/${riskAssessmentId}/matches`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    const uniqueCount = await prisma.applicationMatch.count({
      where: { riskAssessmentId },
    });
    expect(uniqueCount).toBe(response.body.data.matches.length);
  });

  it('usa need_type declarado como fallback cuando no existe validated_need_type', async () => {
    const risk = await request(app.getHttpServer())
      .post(`/api/applications/${applicationWithoutValidatedNeedId}/risk-assessments`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    const matches = await request(app.getHttpServer())
      .post(`/api/risk-assessments/${risk.body.data.id}/matches`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    expect(matches.body.data.effectiveNeedType).toBe('invoices');
    expect(
      matches.body.data.matches.map(
        (match: { financialProduct: { name: string } }) =>
          match.financialProduct.name,
      ),
    ).toContain('Factoraje');
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  async function resetRiskData() {
    await prisma.auditLog.deleteMany();
    await prisma.applicationDecision.deleteMany();
    await prisma.applicationMatch.deleteMany();
    await prisma.riskAssessment.deleteMany();
    await prisma.productRule.deleteMany();
    await prisma.financialProduct.deleteMany();
    await prisma.applicationDocument.deleteMany();
    await prisma.documentRequirement.deleteMany();
    await prisma.applicationStatusHistory.deleteMany();
    await prisma.financingApplication.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  }

  async function seedRiskData() {
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
    const applicant = await prisma.user.create({
      data: {
        roleId: applicantRole.id,
        fullName: 'Applicant Demo',
        email: 'applicant@demo.com',
        passwordHash,
        isActive: true,
      },
    });

    operatorId = operator.id;
    applicantId = applicant.id;

    const [companyA, companyB] = await Promise.all([
      prisma.company.create({
        data: {
          legalName: 'Comercial Riesgo Alpha',
          rfc: 'RIAA900101ABC',
          businessType: 'pfae',
          sector: 'Comercio',
          yearsOperating: '3.00',
          monthlyRevenue: '200000.00',
          monthlyExpenses: '120000.00',
          employeeCount: 10,
          applicantUserId: applicant.id,
          createdByUserId: applicant.id,
        },
      }),
      prisma.company.create({
        data: {
          legalName: 'Comercial Riesgo Beta',
          rfc: 'RIBB900101ABC',
          businessType: 'pfae',
          sector: 'Servicios',
          yearsOperating: '4.00',
          monthlyRevenue: '180000.00',
          monthlyExpenses: '90000.00',
          employeeCount: 8,
          applicantUserId: applicant.id,
          createdByUserId: applicant.id,
        },
      }),
    ]);

    const applicationWithValidatedNeed =
      await prisma.financingApplication.create({
        data: {
          companyId: companyA.id,
          requestedAmount: '250000.00',
          desiredTermMonths: 12,
          fundingPurpose: 'Compra de equipo productivo.',
          urgencyLevel: 'medium',
          needType: 'working_capital',
          validatedNeedType: 'equipment',
          needTypeValidatedByUserId: operator.id,
          needTypeValidatedAt: new Date(),
          needTypeValidationNotes: 'La descripcion corresponde a equipo.',
          hasInvoices: false,
          hasExistingDebt: false,
          creditCheckAuthorized: true,
          creditHistoryStatus: 'good',
          hasCollateral: true,
          collateralType: 'Maquinaria',
          collateralEstimatedValue: '450000.00',
          hasGuarantor: false,
          status: 'ready_for_analysis',
          createdByUserId: applicant.id,
        },
      });
    const applicationWithoutValidatedNeed =
      await prisma.financingApplication.create({
        data: {
          companyId: companyB.id,
          requestedAmount: '150000.00',
          desiredTermMonths: 10,
          fundingPurpose: 'Anticipo sobre facturas por cobrar.',
          urgencyLevel: 'high',
          needType: 'invoices',
          hasInvoices: true,
          hasExistingDebt: false,
          creditCheckAuthorized: true,
          creditHistoryStatus: 'regular',
          hasCollateral: false,
          hasGuarantor: false,
          status: 'ready_for_analysis',
          createdByUserId: applicant.id,
        },
      });
    const applicationMissingDebt = await prisma.financingApplication.create({
      data: {
        companyId: companyA.id,
        requestedAmount: '100000.00',
        desiredTermMonths: 12,
        fundingPurpose: 'Capital operativo.',
        urgencyLevel: 'low',
        needType: 'working_capital',
        hasInvoices: false,
        creditCheckAuthorized: true,
        creditHistoryStatus: 'unknown',
        hasCollateral: false,
        hasGuarantor: false,
        status: 'ready_for_analysis',
        createdByUserId: applicant.id,
      },
    });
    const applicationWithoutDocuments =
      await prisma.financingApplication.create({
        data: {
          companyId: companyA.id,
          requestedAmount: '90000.00',
          desiredTermMonths: 9,
          fundingPurpose: 'Capital operativo.',
          urgencyLevel: 'low',
          needType: 'working_capital',
          hasInvoices: false,
          hasExistingDebt: false,
          creditCheckAuthorized: true,
          creditHistoryStatus: 'unknown',
          hasCollateral: false,
          hasGuarantor: false,
          status: 'ready_for_analysis',
          createdByUserId: applicant.id,
        },
      });

    applicationWithValidatedNeedId = applicationWithValidatedNeed.id;
    applicationWithoutValidatedNeedId = applicationWithoutValidatedNeed.id;
    applicationMissingDebtId = applicationMissingDebt.id;
    applicationWithoutDocumentsId = applicationWithoutDocuments.id;

    const [approvedRequirement, uploadedRequirement, notApplicableRequirement] =
      await Promise.all([
        prisma.documentRequirement.create({
          data: {
            name: 'Identificacion oficial',
            description: 'General aplicable.',
            isRequired: true,
            isActive: true,
          },
        }),
        prisma.documentRequirement.create({
          data: {
            name: 'Estados de cuenta',
            description: 'General aplicable.',
            isRequired: true,
            isActive: true,
          },
        }),
        prisma.documentRequirement.create({
          data: {
            name: 'Cotizacion de maquinaria',
            description: 'Aplicable a equipo.',
            isRequired: true,
            isActive: true,
          },
        }),
      ]);

    await prisma.applicationDocument.createMany({
      data: [
        {
          applicationId: applicationWithValidatedNeed.id,
          documentRequirementId: approvedRequirement.id,
          status: 'approved',
          reviewedByUserId: operator.id,
          reviewedAt: new Date(),
        },
        {
          applicationId: applicationWithValidatedNeed.id,
          documentRequirementId: uploadedRequirement.id,
          status: 'uploaded',
          filePath: `uploads/applications/${applicationWithValidatedNeed.id}/estado.pdf`,
          storedFilename: 'estado.pdf',
          originalFilename: 'estado.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 128,
          fileHashSha256:
            '1111111111111111111111111111111111111111111111111111111111111111',
          uploadedByUserId: applicant.id,
          uploadedAt: new Date(),
        },
        {
          applicationId: applicationWithValidatedNeed.id,
          documentRequirementId: notApplicableRequirement.id,
          status: 'not_applicable',
          reviewedByUserId: operator.id,
          reviewedAt: new Date(),
        },
        {
          applicationId: applicationWithoutValidatedNeed.id,
          documentRequirementId: approvedRequirement.id,
          status: 'approved',
          reviewedByUserId: operator.id,
          reviewedAt: new Date(),
        },
        {
          applicationId: applicationMissingDebt.id,
          documentRequirementId: approvedRequirement.id,
          status: 'approved',
          reviewedByUserId: operator.id,
          reviewedAt: new Date(),
        },
      ],
    });

    const [arrendamiento, factoraje, creditoSimple] =
      await Promise.all([
        prisma.financialProduct.create({
          data: {
            name: 'Arrendamiento',
            description: 'Producto para equipo o activo productivo.',
            minAmount: '50000.00',
            maxAmount: '2000000.00',
            minYearsOperating: '1.00',
            estimatedAnnualRate: '26.00',
            requiresInvoices: false,
            requiresBankStatements: true,
            requiresCollateral: true,
            idealFor: 'equipment',
            isActive: true,
          },
        }),
        prisma.financialProduct.create({
          data: {
            name: 'Factoraje',
            description: 'Anticipo sobre facturas por cobrar.',
            minAmount: '50000.00',
            maxAmount: '1500000.00',
            minYearsOperating: '1.00',
            estimatedAnnualRate: '24.00',
            requiresInvoices: true,
            requiresBankStatements: true,
            requiresCollateral: false,
            idealFor: 'invoices',
            isActive: true,
          },
        }),
        prisma.financialProduct.create({
          data: {
            name: 'Credito simple',
            description: 'Financiamiento general.',
            minAmount: '50000.00',
            maxAmount: '2500000.00',
            minYearsOperating: '2.00',
            estimatedAnnualRate: '28.00',
            requiresInvoices: false,
            requiresBankStatements: true,
            requiresCollateral: false,
            idealFor: 'working_capital',
            isActive: true,
          },
        }),
      ]);

    await prisma.productRule.createMany({
      data: [
        {
          financialProductId: arrendamiento.id,
          ruleField: 'need_type',
          operator: 'equals',
          conditionValue: 'equipment',
          scoreWeight: 35,
        },
        {
          financialProductId: factoraje.id,
          ruleField: 'need_type',
          operator: 'equals',
          conditionValue: 'invoices',
          scoreWeight: 30,
        },
        {
          financialProductId: factoraje.id,
          ruleField: 'has_invoices',
          operator: 'equals',
          conditionValue: 'true',
          scoreWeight: 30,
        },
        {
          financialProductId: creditoSimple.id,
          ruleField: 'years_operating',
          operator: 'gte',
          conditionValue: '2',
          scoreWeight: 20,
        },
        {
          financialProductId: creditoSimple.id,
          ruleField: 'credit_history_status',
          operator: 'equals',
          conditionValue: 'good',
          scoreWeight: 20,
        },
      ],
    });

    expect(operatorId).toBeDefined();
    expect(applicantId).toBeDefined();
  }
});
