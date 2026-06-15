# Arquitectura

## Decision Arquitectonica

El sistema debe implementarse como monolito modular. La separacion debe existir por carpetas, modulos, servicios y responsabilidades internas, no por microservicios.

## Stack

- Frontend: Next.js + TypeScript.
- Backend: NestJS + TypeScript.
- ORM: Prisma.
- Base de datos: PostgreSQL.
- Infraestructura local: Docker Compose.
- Storage local: `uploads/applications/{application_id}/`.
- Auth: JWT + roles.
- API docs: Swagger / OpenAPI.
- Frontend local: `http://localhost:3000`.
- Backend API local: `http://localhost:3001/api`.

## Componentes

```txt
Navegador
  -> Frontend Next.js
  -> HTTP/JSON o multipart/form-data
  -> Backend NestJS
  -> Servicios de negocio
  -> Prisma
  -> PostgreSQL

Backend NestJS
  -> uploads/applications/{application_id}/
```

El frontend no debe acceder directamente a PostgreSQL ni a `uploads/`. Toda operacion debe pasar por la API para validar rol, ownership, estado, datos, archivos y auditoria.

## Modulos Backend

- `auth`: login, JWT, registro publico de applicant y validacion de usuario activo.
- `users`: gestion de usuarios activos e inactivos.
- `roles`: catalogo `internal_operator` y `applicant`.
- `companies`: empresas, ownership por `applicant_user_id` y captura por `created_by_user_id`.
- `financing-applications`: solicitudes, estados, datos financieros y `validated_need_type`. La carpeta/modulo backend debe usar este nombre.
- `document-requirements`: catalogo documental.
- `application-documents`: carga, descarga protegida, metadatos, revision y reemplazo de documentos rechazados.
- `financial-products`: productos financieros simulados.
- `product-rules`: reglas de compatibilidad.
- `risk-assessments`: calculo de riesgo, razones, snapshot e historial.
- `application-matches`: recomendaciones internas por `risk_assessment_id`.
- `application-decisions`: decision final publicable al applicant.
- `status-history`: historial de estados de solicitud.
- `audit-logs`: auditoria tecnica de acciones sensibles.

## Estructura Backend Esperada

```txt
apps/api/src/
  main.ts
  app.module.ts
  common/
    guards/
    decorators/
    filters/
    utils/
  modules/
    auth/
    users/
    roles/
    companies/
    financing-applications/
    document-requirements/
    application-documents/
    financial-products/
    product-rules/
    risk-assessments/
    application-matches/
    application-decisions/
    status-history/
    audit-logs/
  prisma/
    prisma.service.ts
```

## Estructura Frontend Esperada

```txt
apps/web/src/
  app/
    login/
    register/
    dashboard/
    companies/
    applications/
    financial-products/
    audit-logs/
  components/
  features/
  services/api/
  auth/
  lib/
```

El frontend debe separar rutas, componentes reutilizables, features por dominio, cliente HTTP tipado, sesion y guards visuales. Los guards visuales no sustituyen validaciones backend.

## Flujo HTTP

1. El frontend envia request con JWT.
2. `AuthGuard` valida token y usuario activo.
3. `RolesGuard` valida rol.
4. `OwnershipGuard` valida propiedad para `applicant`.
5. DTO valida estructura y tipos.
6. Service aplica reglas de negocio.
7. Prisma consulta o persiste datos.
8. `AuditLogService` registra acciones sensibles.
9. Controller responde en formato estandar.

## Responsabilidades por Capa

- Controller: recibir HTTP, validar autenticacion y delegar.
- DTO: aceptar solo campos definidos y validar tipos.
- Service: aplicar negocio, estados, ownership, calculos y auditoria.
- Prisma: persistir con transacciones, constraints e indices.
- Guards: bloquear acceso por rol y propiedad.
- Frontend: presentar datos permitidos por rol y llamar endpoints.

## Convencion de Naming

- El modulo backend debe llamarse `financing-applications`.
- Las rutas publicas de API deben usar `/applications`.
