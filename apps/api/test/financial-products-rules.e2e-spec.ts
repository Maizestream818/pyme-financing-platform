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

describe('Productos y reglas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let operatorToken: string;
  let applicantToken: string;
  let productId: string;
  let inactiveProductId: string;
  let ruleId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test_secret_fase_5';
    process.env.JWT_EXPIRES_IN = '1h';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    await resetCatalogData();
    await seedUsers();

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
    await resetCatalogData();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('bloquea totalmente a applicant en productos y reglas', async () => {
    const products = await request(app.getHttpServer())
      .get('/api/financial-products')
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(403);

    expect(products.body.error.code).toBe('FORBIDDEN');

    const rules = await request(app.getHttpServer())
      .post('/api/product-rules')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        financialProductId: '00000000-0000-4000-8000-000000000001',
        ruleField: 'need_type',
        operator: 'equals',
        conditionValue: 'working_capital',
        scoreWeight: 20,
      })
      .expect(403);

    expect(rules.body.error.code).toBe('FORBIDDEN');
  });

  it('permite al operador crear producto valido documentado', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/financial-products')
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-request-id', 'fase5-create-product')
      .send({
        name: 'Credito simple',
        description: 'Financiamiento general con plazo definido.',
        minAmount: 50000,
        maxAmount: 2000000,
        minYearsOperating: 2,
        maxResponseDays: 15,
        estimatedAnnualRate: 28,
        requiresInvoices: false,
        requiresBankStatements: true,
        requiresCollateral: false,
        idealFor: 'working_capital',
      })
      .expect(201);

    expect(response.body.success).toBeUndefined();
    expect(response.body.meta.requestId).toBe('fase5-create-product');
    expect(response.body.data).toMatchObject({
      name: 'Credito simple',
      minAmount: '50000',
      maxAmount: '2000000',
      estimatedAnnualRate: '28',
      isActive: true,
    });
    productId = response.body.data.id;

    const list = await request(app.getHttpServer())
      .get('/api/financial-products')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(list.body.data.map((item: { id: string }) => item.id)).toContain(
      productId,
    );
  });

  it('rechaza producto con rango invalido y activo sin tasa', async () => {
    const invalidRange = await request(app.getHttpServer())
      .post('/api/financial-products')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'Capital de trabajo',
        minAmount: 100000,
        maxAmount: 50000,
        minYearsOperating: 1,
        estimatedAnnualRate: 30,
        idealFor: 'working_capital',
      })
      .expect(400);

    expect(invalidRange.body.error.code).toBe('VALIDATION_ERROR');

    const missingRate = await request(app.getHttpServer())
      .post('/api/financial-products')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'Linea revolvente',
        minAmount: 100000,
        maxAmount: 1500000,
        minYearsOperating: 2,
        idealFor: 'working_capital',
      })
      .expect(400);

    expect(missingRate.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('permite producto inactivo sin tasa pero bloquea activacion sin tasa', async () => {
    const inactive = await request(app.getHttpServer())
      .post('/api/financial-products')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'Linea revolvente',
        description: 'Linea para necesidades recurrentes de liquidez.',
        minAmount: 100000,
        maxAmount: 1500000,
        minYearsOperating: 2,
        requiresInvoices: false,
        requiresBankStatements: true,
        requiresCollateral: false,
        idealFor: 'working_capital',
        isActive: false,
      })
      .expect(201);

    inactiveProductId = inactive.body.data.id;
    expect(inactive.body.data.estimatedAnnualRate).toBeNull();
    expect(inactive.body.data.isActive).toBe(false);

    const activation = await request(app.getHttpServer())
      .patch(`/api/financial-products/${inactiveProductId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        isActive: true,
      })
      .expect(400);

    expect(activation.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('permite editar y desactivar producto con is_active', async () => {
    const edited = await request(app.getHttpServer())
      .patch(`/api/financial-products/${productId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        maxAmount: 2200000,
        estimatedAnnualRate: 29.5,
      })
      .expect(200);

    expect(edited.body.data).toMatchObject({
      maxAmount: '2200000',
      estimatedAnnualRate: '29.5',
      isActive: true,
    });

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/financial-products/${productId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        isActive: false,
      })
      .expect(200);

    expect(deactivated.body.data.isActive).toBe(false);
  });

  it('permite crear regla valida y listarla por producto', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/product-rules')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        financialProductId: productId,
        ruleField: 'need_type',
        operator: 'equals',
        conditionValue: 'working_capital',
        scoreWeight: 35,
      })
      .expect(201);

    expect(created.body.data).toMatchObject({
      financialProductId: productId,
      ruleField: 'need_type',
      operator: 'equals',
      conditionValue: 'working_capital',
      conditionValueTo: null,
      scoreWeight: 35,
      isActive: true,
    });
    ruleId = created.body.data.id;

    const rules = await request(app.getHttpServer())
      .get(`/api/financial-products/${productId}/rules`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(rules.body.data.map((item: { id: string }) => item.id)).toEqual([
      ruleId,
    ]);
  });

  it('rechaza regla con score_weight fuera de rango y between sin condition_value_to', async () => {
    const invalidWeight = await request(app.getHttpServer())
      .post('/api/product-rules')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        financialProductId: productId,
        ruleField: 'risk_level',
        operator: 'equals',
        conditionValue: 'high',
        scoreWeight: -125,
      })
      .expect(400);

    expect(invalidWeight.body.error.code).toBe('VALIDATION_ERROR');

    const missingTo = await request(app.getHttpServer())
      .post('/api/product-rules')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        financialProductId: productId,
        ruleField: 'requested_amount',
        operator: 'between',
        conditionValue: '100000',
        scoreWeight: 10,
      })
      .expect(400);

    expect(missingTo.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('permite editar y desactivar regla', async () => {
    const edited = await request(app.getHttpServer())
      .patch(`/api/product-rules/${ruleId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        scoreWeight: 30,
      })
      .expect(200);

    expect(edited.body.data.scoreWeight).toBe(30);

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/product-rules/${ruleId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        isActive: false,
      })
      .expect(200);

    expect(deactivated.body.data.isActive).toBe(false);
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  async function resetCatalogData() {
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

    await prisma.user.createMany({
      data: [
        {
          roleId: internalOperatorRole.id,
          fullName: 'Operador Demo',
          email: 'operador@demo.com',
          passwordHash,
          isActive: true,
        },
        {
          roleId: applicantRole.id,
          fullName: 'Applicant Demo',
          email: 'applicant@demo.com',
          passwordHash,
          isActive: true,
        },
      ],
    });
  }
});
