# AGENTS

## Contexto del Proyecto

PyME Financing Platform es un MVP web para pre-evaluacion de financiamiento PyME. Debe registrar empresas, solicitudes, documentos, riesgo, matching financiero y decision final del operador. El sistema no aprueba creditos reales y no debe incluir integraciones externas fuera del alcance.

Antes de modificar codigo, Codex debe consultar estos documentos:

- `docs/arquitectura.md`
- `docs/base-datos.md`
- `docs/api.md`
- `docs/flujos.md`
- `docs/pantallas.md`
- `docs/reglas-negocio.md`
- `docs/permisos.md`
- `docs/fases.md`
- `docs/pruebas.md`

Los PDFs originales en `Documentacion/` son fuente de verdad historica y no deben modificarse.

## Reglas Globales de Desarrollo

- Mantener el sistema como MVP de pre-evaluacion, gestion documental, analisis de riesgo, matching financiero y decision final del operador.
- No implementar IA generativa, chatbot, buro real, firma electronica, pagos, microservicios ni integraciones externas.
- No inventar tablas, endpoints, modulos ni reglas sin respaldo en `docs/` o `Documentacion/`.
- Si existe contradiccion, documentar `Pendiente de aclaracion` y no resolverla en silencio.
- Usar tono y codigo alineado al stack definido.
- Validar permisos en backend, no solo en frontend.
- No exponer datos internos al applicant.
- No guardar secretos, tokens, `password_hash` ni contenido de documentos en auditoria.

## Stack Obligatorio

- Next.js + TypeScript para `apps/web`.
- NestJS + TypeScript para `apps/api`.
- PostgreSQL + Prisma en `packages/database`.
- Docker Compose para entorno local.
- Frontend en puerto `3000`.
- Backend API en puerto `3001`.
- JWT + roles para autenticacion.
- Storage local en `uploads/`.
- Swagger/OpenAPI para documentar API.

## Estructura del Repo

```txt
apps/
  web/
  api/
packages/
  database/
uploads/
  applications/
docs/
Documentacion/
.agent/
AGENTS.md
README.md
docker-compose.yml
.env.example
```

## Decisiones de Arquitectura

- Usar monolito modular.
- Separar frontend, backend, base de datos y storage local.
- Mantener modulos backend por dominio.
- Usar `application_decisions` como capa de publicacion al applicant.
- Usar `application_matches` solo como resultado interno de matching.
- Usar `validated_need_type` para matching cuando exista; usar `need_type` solo como fallback.
- Reemplazar documentos rechazados en el mismo `application_document`.
- Auditar solo acciones sensibles.

## Prohibiciones

- No conectar frontend directo a PostgreSQL.
- No servir `uploads/` como carpeta publica.
- No guardar archivos binarios en base de datos.
- No borrar fisicamente productos, reglas, requisitos documentales ni usuarios con historial.
- No permitir que applicant vea `risk_score`, DSCR detallado, reglas, pesos, matches internos, auditoria o notas internas.
- No publicar automaticamente el producto con mayor compatibilidad.
- No usar `created_by_user_id` como ownership.
- No calcular riesgo sin `input_snapshot`.
- No generar matching sin `risk_assessment_id`.
- No reabrir solicitudes `closed` en el MVP.
- No activar productos de matching sin `estimated_annual_rate`.

## Reglas de Seguridad

- Todo endpoint protegido debe validar JWT.
- Todo endpoint critico debe validar rol.
- Todo acceso applicant debe validar ownership por `companies.applicant_user_id`.
- Descargas de documentos deben pasar por backend.
- Registro publico applicant no debe permitir elegir rol.
- Los errores de login no deben revelar si fallo email o password.
- Las respuestas applicant deben estar filtradas por contrato.

## Reglas de Base de Datos

- Implementar tablas y enums documentados en `docs/base-datos.md`.
- Incluir `application_decisions`.
- Agregar campos `validated_need_type`, `need_type_validated_by_user_id`, `need_type_validated_at` y `need_type_validation_notes`.
- Crear indices y constraints documentados.
- Usar Decimal para montos e indicadores financieros.
- Cada recalculo crea nuevo `risk_assessment`.
- Cada set de matches pertenece a un `risk_assessment_id`.
- Mantener maximo una decision publicada vigente por solicitud.

## Reglas de API

- Documentar endpoints con Swagger/OpenAPI.
- Usar formato oficial `data/meta/error`. No usar `success: true` ni `success: false`.
- Exponer backend en `http://localhost:3001/api`.
- Usar rutas oficiales de documentos: `POST /applications/:id/documents/initialize`, `GET /applications/:id/documents`, `POST /application-documents/:id/upload`, `PATCH /application-documents/:id/review`, `GET /application-documents/:id/download`.
- Usar rutas oficiales de riesgo: `POST /applications/:id/risk-assessments`, `GET /applications/:id/risk-assessments`, `GET /risk-assessments/:id`.
- Usar carpeta/modulo backend `financing-applications`; usar rutas publicas `/applications`.
- Usar `FILE_VALIDATION_ERROR` para archivo invalido por extension, MIME, tamano, nombre o validacion.
- Usar `DOCUMENT_UPLOAD_ERROR` para fallas de guardado, procesamiento, hash, filesystem o persistencia de metadatos.
- Applicant no consulta `risk_assessments` ni `application_matches`.
- La decision publicada sale de `application_decisions`.
- `POST /auth/register` crea usuarios `applicant`.
- `internal_operator` puede crear usuarios applicant desde flujo interno cuando sea necesario.
- `PATCH /applications/:id/validated-need-type` es solo operador.
- Endpoints de decision son solo operador excepto lectura limitada de applicant.
- Applicant solo ve eventos publicables de `status-history`.

## Reglas de Frontend

- Mostrar pantallas por rol.
- No mostrar controles que el rol no puede usar.
- No confiar en UI como seguridad.
- Mostrar al applicant solo datos propios, documentos y decision publicada.
- Si no hay decision publicada, mostrar estado, documentos, motivos de rechazo y mensaje de solicitud en revision.
- Despues de `ready_for_analysis`, bloquear edicion critica de applicant sobre empresa, solicitud y datos financieros.
- Mostrar al operador analisis, matches, razones, porcentajes, documentos, auditoria y decision.
- Incluir leyenda de pre-evaluacion en resultado applicant.

## Reglas de Pruebas

- Agregar pruebas por fase segun `docs/pruebas.md`.
- Probar permisos y acceso cruzado entre applicants.
- Probar documentos, reemplazo de rechazados y descargas protegidas.
- Probar precondiciones de riesgo.
- Probar matching con `validated_need_type`.
- Probar publicacion de decision y respuesta limitada al applicant.
- Probar auditoria sin secretos.
- Usar Jest + Supertest para pruebas automatizadas API.
- Usar base de datos de prueba separada en Docker o schema separado para integracion.
- Usar Postman solo como apoyo manual.

## Trabajo por Fases

- Codex debe abrir el execplan correspondiente antes de trabajar una fase.
- Codex debe modificar solo archivos permitidos por el execplan.
- Codex debe verificar criterios de aceptacion antes de cerrar fase.
- Codex debe reportar archivos modificados, pruebas ejecutadas y pendientes.
- Codex no debe adelantar funcionalidades de fases futuras.

## Fases Oficiales

- El plan oficial usa Fase 0 a Fase 9.
- Fase 9 incluye auditoria, pruebas, cierre, README final y verificacion.
- No crear Fase 10.
