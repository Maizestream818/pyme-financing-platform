# PyME Financing Platform

MVP web para pre-evaluacion de financiamiento PyME. El sistema registra
empresas, solicitudes, documentos, analisis de riesgo, matching financiero
simulado y decision final publicada por un operador interno.

El MVP no aprueba creditos reales, no sustituye politicas formales de credito y
no se conecta a instituciones financieras externas.

## Estado

Fase 9 cerrada: auditoria, pruebas y cierre del MVP.

Incluye:

- Backend NestJS + TypeScript en `apps/api`.
- Frontend Next.js + TypeScript en `apps/web`.
- Prisma + PostgreSQL en `packages/database`.
- JWT con roles `internal_operator` y `applicant`.
- Storage local en `uploads/applications/{application_id}/`.
- API con formato oficial `data/meta/error`.
- Pruebas API e2e con Jest + Supertest.

## Puertos

- Frontend: `http://localhost:3000`.
- Backend API: `http://localhost:3001/api`.
- PostgreSQL: `localhost:5432`.
- pgAdmin: `http://localhost:5050`.

## Requisitos

- Node.js 20 o superior.
- Corepack habilitado.
- Docker Desktop o Docker Compose.

```bash
corepack enable
corepack pnpm install
```

## Variables de Entorno

Copiar `.env.example` a `.env` para ejecucion local.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Variables principales:

- `DATABASE_URL`
- `TEST_DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `NEXT_PUBLIC_API_BASE_URL`
- `UPLOADS_DIR`
- `MAX_UPLOAD_SIZE_MB`

No versionar `.env`. Solo `.env.example` debe permanecer en Git.

## Base de Datos

Levantar PostgreSQL y pgAdmin:

```bash
docker compose up -d postgres pgadmin
```

Validar Prisma:

```bash
corepack pnpm --filter @pyme/database prisma:validate
```

Si no hay `.env` cargado, exportar `DATABASE_URL` antes de validar.

Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql://pyme:pyme_local_password@localhost:5432/pyme_financing?schema=public"
corepack pnpm --filter @pyme/database prisma:validate
```

Generar cliente, migrar y cargar seed:

```bash
corepack pnpm --filter @pyme/database db:generate
corepack pnpm --filter @pyme/database db:migrate
corepack pnpm --filter @pyme/database db:seed
```

Para pruebas e2e se usa `TEST_DATABASE_URL`. La base de prueba debe existir y
tener migraciones aplicadas.

## Ejecucion Local

En Windows PowerShell, el comando recomendado para levantar el entorno completo
es:

```powershell
corepack pnpm dev:local
```

Este comando crea `.env` desde `.env.example` si hace falta, carga variables de
entorno, levanta PostgreSQL y pgAdmin, instala dependencias, genera Prisma,
aplica migraciones, carga seed y abre ventanas separadas para API y Web.

Modo manual:

Terminal 1:

```bash
corepack pnpm --filter @pyme/api start:dev
```

Terminal 2:

```bash
corepack pnpm --filter @pyme/web dev
```

Abrir `http://localhost:3000`.

## Usuarios Demo

Seed:

- Operador: `operador@demo.com` / `Password123!`
- Applicant: `applicant@demo.com` / `Password123!`

El registro publico siempre crea usuarios con rol `applicant`; el applicant no
puede elegir rol.

## Comandos de Verificacion

```bash
corepack pnpm --filter @pyme/database prisma:validate
corepack pnpm --filter @pyme/api typecheck
corepack pnpm --filter @pyme/api build
corepack pnpm --filter @pyme/api test
corepack pnpm --filter @pyme/api test:e2e
corepack pnpm --filter @pyme/web typecheck
corepack pnpm --filter @pyme/web build
corepack pnpm -r typecheck
```

`@pyme/api test` y `@pyme/api test:e2e` ejecutan suites Jest + Supertest.

## Flujo Applicant

1. Registrarse en `/register`.
2. Iniciar sesion en `/login`.
3. Crear empresa en `/companies`.
4. Crear solicitud en `/applications`.
5. Entrar a documentos de la solicitud.
6. Inicializar checklist si no existe.
7. Subir documentos o reemplazar rechazados.
8. Consultar estado e historial visible.
9. Consultar decision publica en `/applications/:id/public-decision`.

Applicant solo ve sus empresas, solicitudes, documentos, estado y decision
publicada. No ve riesgo, matching, expediente interno, reglas, pesos, DSCR,
notas internas ni auditoria.

## Flujo Internal Operator

1. Iniciar sesion en `/login`.
2. Ver empresas y solicitudes.
3. Inicializar y revisar documentos.
4. Validar `validated_need_type`.
5. Cambiar estado a `ready_for_analysis` cuando aplique.
6. Calcular riesgo.
7. Generar matching.
8. Ver expediente interno.
9. Crear decision oficial.
10. Publicar decision.
11. Cerrar solicitud.
12. Revisar auditoria en `/audit-logs`.

El operador puede ver todos los casos y la informacion interna completa.

## API Principal

Todas las rutas protegidas usan JWT. La API responde con `data/meta/error`; no
usar ni consumir `success: true` o `success: false`.

Rutas principales:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET|POST /api/companies`
- `GET|PATCH /api/companies/:id`
- `GET /api/companies/:id/applications`
- `GET|POST /api/applications`
- `GET|PATCH /api/applications/:id`
- `PATCH /api/applications/:id/financial-info`
- `PATCH /api/applications/:id/status`
- `PATCH /api/applications/:id/validated-need-type`
- `GET /api/applications/:id/status-history`
- `POST /api/applications/:id/documents/initialize`
- `GET /api/applications/:id/documents`
- `POST /api/application-documents/:id/upload`
- `PATCH /api/application-documents/:id/review`
- `GET /api/application-documents/:id/download`
- `GET|POST|PATCH /api/financial-products`
- `GET /api/financial-products/:id/rules`
- `POST|PATCH /api/product-rules`
- `POST /api/applications/:id/risk-assessments`
- `GET /api/applications/:id/risk-assessments`
- `GET /api/risk-assessments/:id`
- `GET|POST /api/risk-assessments/:id/matches`
- `GET /api/applications/:id/internal-file`
- `POST /api/applications/:id/decisions`
- `GET /api/applications/:id/decisions`
- `PATCH /api/application-decisions/:id`
- `PATCH /api/application-decisions/:id/publish`
- `GET /api/applications/:id/public-decision`
- `PATCH /api/applications/:id/close`
- `GET /api/audit-logs`

## Auditoria

Se auditan acciones sensibles:

- `register_applicant`
- `login`
- `validate_need_type`
- `upload_document`
- `replace_document`
- `review_document`
- `calculate_risk`
- `generate_matches`
- `create`
- `update`
- `publish_decision`
- `status_change`

Se mantienen los nombres `create`, `status_change` y `publish_decision` usados
por decisiones/cierre porque existen en el enum oficial `audit_action` y ya son
consistentes con las pruebas. `create` se usa para crear decision;
`publish_decision` para publicar decision; `status_change` para cierre o cambios
de estado auditados.

La auditoria no debe guardar `password_hash`, tokens ni contenido documental.

## Reglas de Seguridad Relevantes

- Backend es autoridad de permisos y ownership.
- Applicant se autoriza por `companies.applicant_user_id`.
- No usar `created_by_user_id` como ownership.
- Descargas pasan por backend.
- `uploads/` no es carpeta publica.
- `application_matches` son internos.
- `application_decisions` es la decision oficial publicada.
- Solo puede existir una decision publicada vigente por solicitud.
- Al publicar una nueva decision se despublica la anterior en la misma transaccion.
- Solicitudes `closed` no se reabren en el MVP.

## Pendientes

No hay pendientes funcionales bloqueantes para demo tecnica local. Como mejora
posterior puede agregarse mayor cobertura unitaria por servicio, manteniendo las
suites e2e actuales como prueba principal del MVP.
