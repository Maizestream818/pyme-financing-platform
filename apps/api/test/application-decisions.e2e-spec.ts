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

describe('Decisiones y expediente (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let operatorToken: string;
  let applicantAToken: string;
  let applicantBToken: string;
  let operatorId: string;
  let applicantAId: string;
  let applicationAId: string;
  let applicationBId: string;
  let applicationWithoutDecisionId: string;
  let riskAssessmentAId: string;
  let riskAssessmentBId: string;
  let matchAId: string;
  let matchBId: string;
  let firstDecisionId: string;
  let secondDecisionId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test_secret_fase_7';
    process.env.JWT_EXPIRES_IN = '1h';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    await resetDecisionData();
    await seedDecisionData();

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
    await resetDecisionData();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('bloquea a applicant en expediente interno y decisiones completas', async () => {
    const internalFile = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/internal-file`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(403);

    expect(internalFile.body.error.code).toBe('FORBIDDEN');

    const createDecision = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/decisions`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({
        riskAssessmentId: riskAssessmentAId,
        decisionStatus: 'under_review',
        publicMessage: 'Mensaje publico.',
      })
      .expect(403);

    expect(createDecision.body.error.code).toBe('FORBIDDEN');

    const listDecisions = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/decisions`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(403);

    expect(listDecisions.body.error.code).toBe('FORBIDDEN');
  });

  it('permite al operador ver expediente completo con riesgo y matches internos', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/internal-file`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(response.body.success).toBeUndefined();
    expect(response.body.data.application.id).toBe(applicationAId);
    expect(response.body.data.company.applicantUserId).toBe(applicantAId);
    expect(response.body.data.riskAssessments[0].riskScore).toBeDefined();
    expect(response.body.data.riskAssessments[0].matches[0]).toMatchObject({
      id: matchAId,
      financialProduct: { name: 'Credito simple' },
    });
    expect(response.body.data.riskAssessments[0].matches[0].reason).toMatchObject({
      reason: 'match interno',
    });
  });

  it('rechaza decision con analisis o match inconsistente', async () => {
    const wrongRisk = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/decisions`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        riskAssessmentId: riskAssessmentBId,
        decisionStatus: 'under_review',
        publicMessage: 'Mensaje publico.',
      })
      .expect(400);

    expect(wrongRisk.body.error.code).toBe('VALIDATION_ERROR');
    expect(wrongRisk.body.error.details).toContainEqual({
      field: 'riskAssessmentId',
      issue: 'must_belong_to_application',
    });

    const wrongMatch = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/decisions`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        riskAssessmentId: riskAssessmentAId,
        selectedMatchId: matchBId,
        decisionStatus: 'prequalified',
        approvedAmount: 180000,
        approvedTermMonths: 12,
        publicMessage: 'Mensaje publico.',
      })
      .expect(400);

    expect(wrongMatch.body.error.code).toBe('VALIDATION_ERROR');
    expect(wrongMatch.body.error.details).toContainEqual({
      field: 'selectedMatchId',
      issue: 'must_belong_to_risk_assessment',
    });
  });

  it('crea y edita decision oficial solo como operador', async () => {
    const invalidPrequalified = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/decisions`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        riskAssessmentId: riskAssessmentAId,
        selectedMatchId: matchAId,
        decisionStatus: 'prequalified',
        publicMessage: 'Tu solicitud puede avanzar.',
      })
      .expect(400);

    expect(invalidPrequalified.body.error.code).toBe('VALIDATION_ERROR');

    const created = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/decisions`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-request-id', 'fase7-create-decision')
      .send({
        riskAssessmentId: riskAssessmentAId,
        selectedMatchId: matchAId,
        decisionStatus: 'prequalified',
        approvedAmount: 180000,
        approvedTermMonths: 12,
        estimatedMonthlyPayment: 17150,
        publicMessage: 'Tu solicitud fue revisada y puede avanzar.',
        internalNotes: 'Notas internas de decision.',
      })
      .expect(201);

    expect(created.body.meta.requestId).toBe('fase7-create-decision');
    expect(created.body.data).toMatchObject({
      applicationId: applicationAId,
      riskAssessmentId: riskAssessmentAId,
      selectedMatchId: matchAId,
      decisionStatus: 'prequalified',
      approvedAmount: '180000',
      approvedTermMonths: 12,
      internalNotes: 'Notas internas de decision.',
      isPublishedToApplicant: false,
    });
    firstDecisionId = created.body.data.id;

    const forbiddenUpdate = await request(app.getHttpServer())
      .patch(`/api/application-decisions/${firstDecisionId}`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .send({ publicMessage: 'Intento applicant.' })
      .expect(403);

    expect(forbiddenUpdate.body.error.code).toBe('FORBIDDEN');

    const updated = await request(app.getHttpServer())
      .patch(`/api/application-decisions/${firstDecisionId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ publicMessage: 'Mensaje publico actualizado.' })
      .expect(200);

    expect(updated.body.data.publicMessage).toBe('Mensaje publico actualizado.');

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'create',
        entityName: 'application_decisions',
        entityId: firstDecisionId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('devuelve vista publica controlada antes y despues de publicar', async () => {
    const beforePublish = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/public-decision`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(beforePublish.body.data).toMatchObject({
      applicationId: applicationAId,
      status: 'not_published',
      message: 'Solicitud en revision.',
    });
    expect(JSON.stringify(beforePublish.body.data)).not.toContain('riskScore');
    expect(JSON.stringify(beforePublish.body.data)).not.toContain('internalNotes');

    const crossAccess = await request(app.getHttpServer())
      .get(`/api/applications/${applicationBId}/public-decision`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(403);

    expect(crossAccess.body.error.code).toBe('FORBIDDEN');

    const forbiddenPublish = await request(app.getHttpServer())
      .patch(`/api/application-decisions/${firstDecisionId}/publish`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(403);

    expect(forbiddenPublish.body.error.code).toBe('FORBIDDEN');

    await request(app.getHttpServer())
      .patch(`/api/application-decisions/${firstDecisionId}/publish`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    const application = await prisma.financingApplication.findUniqueOrThrow({
      where: { id: applicationAId },
    });
    expect(application.status).toBe('decision_published');

    const publicDecision = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/public-decision`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(publicDecision.body.data).toMatchObject({
      id: firstDecisionId,
      decisionStatus: 'prequalified',
      productName: 'Credito simple',
      approvedAmount: '180000',
      approvedTermMonths: 12,
      estimatedMonthlyPayment: '17150',
      annualInterestRate: '28',
    });
    expect(publicDecision.body.data.legend).toContain('precalificacion');
    expect(JSON.stringify(publicDecision.body.data)).not.toContain('riskScore');
    expect(JSON.stringify(publicDecision.body.data)).not.toContain('riskLevel');
    expect(JSON.stringify(publicDecision.body.data)).not.toContain('internalNotes');
    expect(JSON.stringify(publicDecision.body.data)).not.toContain('application_matches');

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'publish_decision',
        entityName: 'application_decisions',
        entityId: firstDecisionId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('despublica decision anterior al publicar una nueva', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/applications/${applicationAId}/decisions`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        riskAssessmentId: riskAssessmentAId,
        selectedMatchId: matchAId,
        decisionStatus: 'needs_more_information',
        publicMessage: 'Necesitamos informacion adicional.',
        internalNotes: 'Solicitar estados de cuenta actualizados.',
      })
      .expect(201);

    secondDecisionId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/application-decisions/${secondDecisionId}/publish`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    const decisions = await prisma.applicationDecision.findMany({
      where: { applicationId: applicationAId },
      orderBy: { createdAt: 'asc' },
    });

    expect(decisions.filter((decision) => decision.isPublishedToApplicant)).toHaveLength(
      1,
    );
    expect(
      decisions.find((decision) => decision.id === firstDecisionId)
        ?.isPublishedToApplicant,
    ).toBe(false);
    expect(
      decisions.find((decision) => decision.id === secondDecisionId)
        ?.isPublishedToApplicant,
    ).toBe(true);

    const publicDecision = await request(app.getHttpServer())
      .get(`/api/applications/${applicationAId}/public-decision`)
      .set('Authorization', `Bearer ${applicantAToken}`)
      .expect(200);

    expect(publicDecision.body.data).toMatchObject({
      id: secondDecisionId,
      decisionStatus: 'needs_more_information',
      publicMessage: 'Necesitamos informacion adicional.',
    });
    expect(publicDecision.body.data.approvedAmount).toBeNull();
  });

  it('cierra solo con decision publicada y no reabre solicitudes cerradas', async () => {
    const closeWithoutDecision = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationWithoutDecisionId}/close`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ comment: 'Intento de cierre sin decision.' })
      .expect(400);

    expect(closeWithoutDecision.body.error.code).toBe('INVALID_STATE_TRANSITION');

    const closed = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/close`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ comment: 'Caso cerrado por operador.' })
      .expect(200);

    expect(closed.body.data).toMatchObject({
      id: applicationAId,
      previousStatus: 'decision_published',
      status: 'closed',
    });

    const saved = await prisma.financingApplication.findUniqueOrThrow({
      where: { id: applicationAId },
    });
    expect(saved.status).toBe('closed');

    const reopen = await request(app.getHttpServer())
      .patch(`/api/applications/${applicationAId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'matched', comment: 'Intento de reapertura.' })
      .expect(400);

    expect(reopen.body.error.code).toBe('INVALID_STATE_TRANSITION');

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'status_change',
        entityName: 'financing_applications',
        entityId: applicationAId,
      },
    });
    expect(audit).not.toBeNull();
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  async function resetDecisionData() {
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

  async function seedDecisionData() {
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

    const [operator, applicantA, applicantB] = await Promise.all([
      prisma.user.create({
        data: {
          roleId: internalOperatorRole.id,
          fullName: 'Operador Demo',
          email: 'operador@demo.com',
          passwordHash,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          roleId: applicantRole.id,
          fullName: 'Applicant A',
          email: 'applicant-a@demo.com',
          passwordHash,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          roleId: applicantRole.id,
          fullName: 'Applicant B',
          email: 'applicant-b@demo.com',
          passwordHash,
          isActive: true,
        },
      }),
    ]);

    operatorId = operator.id;
    applicantAId = applicantA.id;

    const [companyA, companyB] = await Promise.all([
      prisma.company.create({
        data: {
          legalName: 'Decision Alpha',
          rfc: 'DECA900101ABC',
          businessType: 'pfae',
          sector: 'Comercio',
          yearsOperating: '3.00',
          monthlyRevenue: '200000.00',
          monthlyExpenses: '110000.00',
          employeeCount: 12,
          applicantUserId: applicantA.id,
          createdByUserId: applicantA.id,
        },
      }),
      prisma.company.create({
        data: {
          legalName: 'Decision Beta',
          rfc: 'DECB900101ABC',
          businessType: 'pfae',
          sector: 'Servicios',
          yearsOperating: '4.00',
          monthlyRevenue: '180000.00',
          monthlyExpenses: '85000.00',
          employeeCount: 9,
          applicantUserId: applicantB.id,
          createdByUserId: applicantB.id,
        },
      }),
    ]);

    const [applicationA, applicationB, applicationWithoutDecision] =
      await Promise.all([
        prisma.financingApplication.create({
          data: {
            companyId: companyA.id,
            requestedAmount: '180000.00',
            desiredTermMonths: 12,
            fundingPurpose: 'Capital de trabajo para inventario.',
            urgencyLevel: 'medium',
            needType: 'working_capital',
            hasInvoices: false,
            hasExistingDebt: false,
            creditCheckAuthorized: true,
            creditHistoryStatus: 'good',
            hasCollateral: false,
            hasGuarantor: false,
            status: 'matched',
            createdByUserId: applicantA.id,
          },
        }),
        prisma.financingApplication.create({
          data: {
            companyId: companyB.id,
            requestedAmount: '150000.00',
            desiredTermMonths: 10,
            fundingPurpose: 'Capital para servicios.',
            urgencyLevel: 'low',
            needType: 'working_capital',
            hasInvoices: false,
            hasExistingDebt: false,
            creditCheckAuthorized: true,
            creditHistoryStatus: 'regular',
            hasCollateral: false,
            hasGuarantor: false,
            status: 'matched',
            createdByUserId: applicantB.id,
          },
        }),
        prisma.financingApplication.create({
          data: {
            companyId: companyA.id,
            requestedAmount: '90000.00',
            desiredTermMonths: 9,
            fundingPurpose: 'Solicitud sin decision.',
            urgencyLevel: 'low',
            needType: 'working_capital',
            hasInvoices: false,
            hasExistingDebt: false,
            creditCheckAuthorized: true,
            creditHistoryStatus: 'unknown',
            hasCollateral: false,
            hasGuarantor: false,
            status: 'matched',
            createdByUserId: applicantA.id,
          },
        }),
      ]);

    applicationAId = applicationA.id;
    applicationBId = applicationB.id;
    applicationWithoutDecisionId = applicationWithoutDecision.id;

    const product = await prisma.financialProduct.create({
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
    });

    const [riskA, riskB] = await Promise.all([
      createRiskAssessment(applicationA.id),
      createRiskAssessment(applicationB.id),
    ]);

    riskAssessmentAId = riskA.id;
    riskAssessmentBId = riskB.id;

    const [matchA, matchB] = await Promise.all([
      prisma.applicationMatch.create({
        data: {
          riskAssessmentId: riskA.id,
          financialProductId: product.id,
          compatibilityScore: '82.00',
          reason: JSON.stringify({ reason: 'match interno' }),
          estimatedAnnualRateUsed: '28.00',
          estimatedMonthlyPayment: '17150.00',
          debtServiceCoverageRatio: '4.5000',
        },
      }),
      prisma.applicationMatch.create({
        data: {
          riskAssessmentId: riskB.id,
          financialProductId: product.id,
          compatibilityScore: '75.00',
          reason: JSON.stringify({ reason: 'match de otro analisis' }),
          estimatedAnnualRateUsed: '28.00',
          estimatedMonthlyPayment: '14500.00',
          debtServiceCoverageRatio: '4.0000',
        },
      }),
    ]);

    matchAId = matchA.id;
    matchBId = matchB.id;

    await prisma.applicationStatusHistory.createMany({
      data: [
        {
          applicationId: applicationA.id,
          previousStatus: 'analyzed',
          newStatus: 'matched',
          comment: 'Matching generado.',
          changedByUserId: operator.id,
        },
        {
          applicationId: applicationB.id,
          previousStatus: 'analyzed',
          newStatus: 'matched',
          comment: 'Matching generado.',
          changedByUserId: operator.id,
        },
      ],
    });

    expect(operatorId).toBeDefined();
  }

  async function createRiskAssessment(applicationId: string) {
    return prisma.riskAssessment.create({
      data: {
        applicationId,
        estimatedCashflow: '90000.00',
        operatingMargin: '0.4500',
        requestedAmountToRevenueRatio: '0.9000',
        estimatedMonthlyPayment: '15000.00',
        totalMonthlyDebtPayment: '15000.00',
        debtServiceCoverageRatio: '6.0000',
        paymentCapacity: '90000.00',
        documentCompletionPercentage: '100.00',
        riskScore: '85.00',
        riskLevel: 'low',
        riskReasons: [{ code: 'good_credit_history', impact: 10 }],
        inputSnapshot: { source: 'fase7-test' },
        ruleSetVersion: 'fase-06-mvp',
        calculatedByUserId: operatorId,
      },
    });
  }
});
