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

describe('Auth y roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let operatorToken: string;
  let applicantToken: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test_secret_fase_2';
    process.env.JWT_EXPIRES_IN = '1h';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });

    await resetAuthData();
    await seedAuthData();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('registra un applicant publico sin permitir seleccionar rol', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('x-request-id', 'test-register')
      .send({
        fullName: 'Applicant Nuevo',
        email: 'nuevo@example.com',
        password: DEMO_PASSWORD,
      })
      .expect(201);

    expect(response.body.success).toBeUndefined();
    expect(response.body.meta.requestId).toBe('test-register');
    expect(response.body.data).toMatchObject({
      fullName: 'Applicant Nuevo',
      email: 'nuevo@example.com',
      role: 'applicant',
      isActive: true,
    });
    expect(response.body.data.passwordHash).toBeUndefined();

    const user = await prisma.user.findUnique({
      where: { email: 'nuevo@example.com' },
      include: { role: true },
    });

    expect(user?.role.name).toBe('applicant');
  });

  it('bloquea seleccion de rol en registro publico', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        fullName: 'Rol Forzado',
        email: 'rol-forzado@example.com',
        password: DEMO_PASSWORD,
        role: 'internal_operator',
      })
      .expect(400);

    expect(response.body.success).toBeUndefined();
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    const user = await prisma.user.findUnique({
      where: { email: 'rol-forzado@example.com' },
    });

    expect(user).toBeNull();
  });

  it('permite login de internal_operator y GET /auth/me', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operador@demo.com',
        password: DEMO_PASSWORD,
      })
      .expect(200);

    expect(login.body.success).toBeUndefined();
    expect(login.body.data.user).toMatchObject({
      email: 'operador@demo.com',
      role: 'internal_operator',
    });
    expect(login.body.data.user.passwordHash).toBeUndefined();
    expect(login.body.data.accessToken).toBeDefined();

    operatorToken = login.body.data.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(me.body.data).toMatchObject({
      email: 'operador@demo.com',
      role: 'internal_operator',
    });
    expect(me.body.data.passwordHash).toBeUndefined();
  });

  it('permite login de applicant demo con el hash real del seed', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'applicant@demo.com',
        password: DEMO_PASSWORD,
      })
      .expect(200);

    applicantToken = login.body.data.accessToken;

    expect(login.body.data.user).toMatchObject({
      email: 'applicant@demo.com',
      role: 'applicant',
    });
  });

  it('devuelve error generico en login fallido', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operador@demo.com',
        password: 'Password123!x',
      })
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe(
      'No se pudo iniciar sesion con las credenciales proporcionadas.',
    );
  });

  it('bloquea login de usuario inactivo con el mismo error generico', async () => {
    const applicantRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'applicant' },
    });

    await prisma.user.create({
      data: {
        roleId: applicantRole.id,
        fullName: 'Usuario Inactivo',
        email: 'inactivo@example.com',
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
        isActive: false,
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'inactivo@example.com',
        password: DEMO_PASSWORD,
      })
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe(
      'No se pudo iniciar sesion con las credenciales proporcionadas.',
    );
  });

  it('rechaza token faltante e invalido', async () => {
    const missing = await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401);

    expect(missing.body.error.code).toBe('UNAUTHORIZED');

    const invalid = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);

    expect(invalid.body.error.code).toBe('UNAUTHORIZED');
  });

  it('permite que internal_operator cree applicants y bloquea a applicant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fullName: 'Applicant Interno',
        email: 'interno@example.com',
        password: DEMO_PASSWORD,
      })
      .expect(201);

    expect(created.body.data).toMatchObject({
      email: 'interno@example.com',
      role: 'applicant',
    });
    expect(created.body.data.passwordHash).toBeUndefined();

    const forbidden = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        fullName: 'No Permitido',
        email: 'no-permitido@example.com',
        password: DEMO_PASSWORD,
      })
      .expect(403);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('protege GET /roles solo para internal_operator', async () => {
    const roles = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    expect(roles.body.data.map((role: { name: string }) => role.name)).toEqual([
      'applicant',
      'internal_operator',
    ]);

    const forbidden = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(403);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('audita registro applicant y login sin guardar secretos', async () => {
    const registerAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'register_applicant',
        entityName: 'users',
      },
      orderBy: { createdAt: 'desc' },
    });

    const loginAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'login',
        entityName: 'users',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(registerAudit).not.toBeNull();
    expect(loginAudit).not.toBeNull();
    expect(JSON.stringify(registerAudit?.newValues)).not.toContain('password');
    expect(JSON.stringify(loginAudit?.newValues)).not.toContain('token');
  });

  async function resetAuthData() {
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  }

  async function seedAuthData() {
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
