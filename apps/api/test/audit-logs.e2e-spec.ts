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

describe('Audit logs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let operatorToken: string;
  let applicantToken: string;
  let operatorId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test_secret_fase_9';
    process.env.JWT_EXPIRES_IN = '1h';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    await resetAuditData();
    await seedAuditData();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    operatorToken = await login('operador-audit@demo.com');
    applicantToken = await login('applicant-audit@demo.com');
  });

  afterAll(async () => {
    await resetAuditData();
    await app?.close();
    await prisma?.$disconnect();
  });

  it('permite al operador consultar auditoria sin secretos', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-request-id', 'fase9-audit-list')
      .expect(200);

    expect(response.body.success).toBeUndefined();
    expect(response.body.meta.requestId).toBe('fase9-audit-list');
    expect(response.body.data.length).toBeGreaterThan(0);

    const seededLog = response.body.data.find(
      (log: { entityName: string }) => log.entityName === 'fase9_audit_probe',
    );

    expect(seededLog).toMatchObject({
      userId: operatorId,
      action: 'create',
      entityName: 'fase9_audit_probe',
      user: {
        email: 'operador-audit@demo.com',
        role: 'internal_operator',
      },
    });

    const serialized = JSON.stringify(response.body.data);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('accessToken');
    expect(serialized).not.toContain(DEMO_PASSWORD);
  });

  it('bloquea auditoria para applicant y usuarios sin token', async () => {
    const applicantResponse = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(403);

    expect(applicantResponse.body.error.code).toBe('FORBIDDEN');

    const anonymousResponse = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .expect(401);

    expect(anonymousResponse.body.error.code).toBe('UNAUTHORIZED');
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: DEMO_PASSWORD })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  async function resetAuditData() {
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

  async function seedAuditData() {
    const [internalOperatorRole, applicantRole] = await Promise.all([
      prisma.role.create({
        data: {
          name: 'internal_operator',
          description: 'Operador interno de auditoria.',
          isActive: true,
        },
      }),
      prisma.role.create({
        data: {
          name: 'applicant',
          description: 'Applicant de auditoria.',
          isActive: true,
        },
      }),
    ]);

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const [operator] = await Promise.all([
      prisma.user.create({
        data: {
          roleId: internalOperatorRole.id,
          fullName: 'Operador Auditoria',
          email: 'operador-audit@demo.com',
          passwordHash,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          roleId: applicantRole.id,
          fullName: 'Applicant Auditoria',
          email: 'applicant-audit@demo.com',
          passwordHash,
          isActive: true,
        },
      }),
    ]);

    operatorId = operator.id;

    await prisma.auditLog.create({
      data: {
        userId: operator.id,
        action: 'create',
        entityName: 'fase9_audit_probe',
        entityId: operator.id,
        newValues: {
          visibleField: 'valor controlado',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });
  }
});
