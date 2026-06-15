# Permisos

## Regla Central

La seguridad debe vivir en backend. Ocultar botones en frontend no protege datos. Cada endpoint critico debe validar JWT, rol, ownership, estado y reglas de negocio.

## Roles

- `internal_operator`: opera todos los casos, documentos, riesgo, matching, productos, reglas, auditoria y decisiones.
- `applicant`: opera solo empresas, solicitudes, documentos propios y decision publicada propia.

## Ownership

- Applicant solo accede a empresas donde `companies.applicant_user_id = user.id`.
- Solicitudes se autorizan mediante la empresa asociada.
- Documentos se autorizan mediante la solicitud asociada.
- Decisiones se autorizan mediante la solicitud y solo si estan publicadas para applicant.
- Empresas con `applicant_user_id = NULL` pertenecen al flujo interno y solo las opera `internal_operator`.

## Matriz por Modulo

| Modulo | Accion | internal_operator | applicant |
| --- | --- | --- | --- |
| Auth | Login | Si | Si |
| Auth | Registro applicant | No aplica | Si, ruta publica |
| Users | Crear applicant desde flujo interno | Si | No |
| Users | Crear usuario | Si | No |
| Users | Desactivar usuario | Si | No |
| Companies | Crear | Si | Si, propia |
| Companies | Ver | Todas | Solo propias |
| Companies | Editar | Si | Solo propias |
| Applications | Crear | Si | Si, sobre empresa propia |
| Applications | Ver | Todas | Solo propias |
| Applications | Cambiar estado | Si | No |
| Applications | Validar necesidad | Si | No |
| Applications | Editar datos criticos despues de ready_for_analysis | Si | No |
| Documents | Cargar | Si | Solo propios |
| Documents | Reemplazar rechazado | Si | Solo propio |
| Documents | Revisar | Si | No |
| Documents | Descargar | Si | Solo propios |
| Risk | Calcular | Si | No |
| Risk | Ver analisis interno | Si | No |
| Matching | Generar | Si | No |
| Matching | Ver matches internos | Si | No |
| Decisions | Crear | Si | No |
| Decisions | Publicar | Si | No |
| Decisions | Ver decision publicada | Si | Solo propia y publicada |
| Products | Crear/editar/desactivar | Si | No |
| Rules | Crear/editar/desactivar | Si | No |
| Audit | Ver logs | Si | No |

## Restricciones Applicant

Applicant no debe:

- Elegir rol al registrarse.
- Ver o editar empresas ajenas.
- Ver o editar solicitudes ajenas.
- Revisar, aprobar o rechazar documentos.
- Calcular riesgo.
- Ver `risk_assessments`.
- Ver `application_matches`.
- Ver porcentajes, reglas, pesos, DSCR detallado o comparativas internas.
- Ver `audit_logs`.
- Ver `internal_notes`.
- Ver decisiones no publicadas.
- Descargar documentos por ruta directa.

## Capacidades Internal Operator

Internal operator debe:

- Ver todos los casos.
- Crear usuarios applicant desde flujo interno cuando sea necesario.
- Crear empresas internas sin `applicant_user_id`.
- Revisar documentos.
- Validar `validated_need_type`.
- Ejecutar riesgo.
- Generar matching.
- Ver expediente completo.
- Crear y publicar decisiones.
- Administrar productos y reglas.
- Consultar auditoria.

## Endpoints Criticos Protegidos

- `GET /companies`: filtrar por `applicant_user_id` para applicant.
- `GET /applications/:id`: validar ownership por empresa.
- `PATCH /applications/:id/status`: solo operador.
- `PATCH /applications/:id/validated-need-type`: solo operador.
- `GET /applications/:id/status-history`: operador ve historial completo; applicant solo eventos publicables.
- `POST /application-documents/:id/upload`: operador o applicant propietario.
- `PATCH /application-documents/:id/review`: solo operador.
- `GET /application-documents/:id/download`: validar ownership y servir desde backend.
- `POST /applications/:id/risk-assessments`: solo operador.
- `POST /risk-assessments/:id/matches`: solo operador.
- `POST /applications/:id/decision`: solo operador.
- `PATCH /application-decisions/:id/publish`: solo operador.
- `GET /applications/:id/decision`: operador ve completa; applicant solo publicada y propia.
- `GET /audit-logs`: solo operador.

## Reglas Anti Acceso Cruzado

- No aceptar `applicantUserId` enviado por applicant para asignar propiedad.
- No permitir que applicant elija rol.
- Derivar propiedad desde JWT.
- Para applicant, cada query debe incluir ownership por relacion.
- Devolver `403` o `404` controlado cuando el recurso no sea visible.
- No filtrar solo en frontend.
- No exponer rutas locales de archivos.
- No usar `created_by_user_id` como ownership.

## Reglas Posteriores a Ready for Analysis

- Applicant no debe editar datos criticos de empresa, solicitud ni datos financieros despues de `ready_for_analysis`.
- Applicant solo puede reemplazar documentos rechazados si el flujo lo permite.
- Correcciones criticas requieren intervencion de `internal_operator`.
