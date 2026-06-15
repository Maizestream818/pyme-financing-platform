# API

## Principios

- El backend debe ser la autoridad de permisos, ownership, validaciones y estados.
- La API debe ser REST modular.
- Los endpoints deben usar JSON para datos y `multipart/form-data` para archivos.
- Las fechas deben serializarse en ISO 8601 UTC.
- Los IDs deben ser UUID.
- Swagger/OpenAPI debe documentar payloads, respuestas y errores.
- Frontend oficial: `http://localhost:3000`.
- Backend API oficial: `http://localhost:3001/api`.

## Convencion de Respuestas

El formato oficial de respuesta exitosa usa `data` y `meta`. No usar `success: true` ni `success: false`.

```json
{
  "data": {},
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-06-14T10:00:00.000Z"
  }
}
```

## Convencion de Errores

El formato oficial de error usa `error` y `meta`.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "No se puede calcular riesgo porque falta confirmar deuda existente.",
    "details": [
      { "field": "hasExistingDebt", "issue": "required_before_risk_analysis" }
    ]
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-06-14T10:00:00.000Z"
  }
}
```

Codigos documentados:

- `AUTH_INVALID_CREDENTIALS`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `INVALID_STATE_TRANSITION`
- `RISK_PRECONDITION_FAILED`
- `MATCH_PRECONDITION_FAILED`
- `FILE_VALIDATION_ERROR`
- `DOCUMENT_UPLOAD_ERROR`
- `DUPLICATE_RESOURCE`

`FILE_VALIDATION_ERROR` debe usarse cuando el archivo sea invalido por extension, MIME, tamano, nombre o validacion.

`DOCUMENT_UPLOAD_ERROR` debe usarse cuando falle el guardado, procesamiento, hash, filesystem o persistencia de metadatos.

## Endpoints por Modulo

### Auth

- `POST /auth/register`: publico. Crea `applicant`, valida email unico, password fuerte, `fullName` y asigna rol `applicant`.
- `POST /auth/login`: publico. Inicia sesion sin revelar detalle del fallo.
- `GET /auth/me`: autenticado. Devuelve usuario actual.
- `POST /auth/logout`: autenticado. Cierra sesion logica si aplica.

### Users y Roles

- `GET /users`: `internal_operator`.
- `POST /users`: `internal_operator`.
- `PATCH /users/:id`: `internal_operator`.
- `GET /roles`: `internal_operator`.

No exponer `password_hash`.

`internal_operator` puede crear usuarios applicant desde flujo interno si es necesario. Applicant nunca puede elegir su rol.

### Companies

- `GET /companies`: ambos roles. `internal_operator` ve todas; `applicant` solo propias.
- `POST /companies`: ambos roles. Si crea applicant, asignar `applicant_user_id` al usuario autenticado.
- `GET /companies/:id`: ambos roles con ownership.
- `PATCH /companies/:id`: ambos roles con ownership y restricciones por estado.
- `GET /companies/:id/applications`: ambos roles con ownership.

### Applications

El modulo backend debe llamarse `financing-applications`. Las rutas publicas deben usar `/applications`.

- `GET /applications`: ambos roles. Filtrar por ownership para applicant.
- `POST /applications`: ambos roles. Validar `company_id`, monto, plazo y necesidad.
- `GET /applications/:id`: ambos roles. Applicant recibe detalle limitado.
- `PATCH /applications/:id`: ambos roles con ownership. Bloquear cambios criticos para applicant despues de `ready_for_analysis` y bloquear cambios si `closed`.
- `PATCH /applications/:id/financial-info`: ambos roles con ownership. Bloquear edicion critica de applicant despues de `ready_for_analysis`.
- `PATCH /applications/:id/status`: `internal_operator`.
- `PATCH /applications/:id/validated-need-type`: `internal_operator`. Guarda `validated_need_type`, notas, usuario, fecha y audita `validate_need_type`.
- `GET /applications/:id/status-history`: ambos roles con ownership. Applicant solo recibe eventos publicables; operador recibe historial completo.

### Document Requirements

- `GET /document-requirements`: ambos roles.
- `POST /document-requirements`: `internal_operator`.
- `PATCH /document-requirements/:id`: `internal_operator`.

### Application Documents

- `POST /applications/:id/documents/initialize`: crea checklist documental con requisitos activos.
- `GET /applications/:id/documents`: ambos roles con ownership.
- `POST /application-documents/:id/upload`: ambos roles con ownership.
- `PATCH /application-documents/:id/review`: `internal_operator`.
- `GET /application-documents/:id/download`: ambos roles con ownership.

### Financial Products y Product Rules

- `GET /financial-products`: `internal_operator`.
- `POST /financial-products`: `internal_operator`.
- `PATCH /financial-products/:id`: `internal_operator`.
- `GET /financial-products/:id/rules`: `internal_operator`.
- `POST /product-rules`: `internal_operator`.
- `PATCH /product-rules/:id`: `internal_operator`.

Applicant no debe acceder a productos, reglas, pesos ni comparativas internas.

### Risk

- `GET /applications/:id/risk-assessments`: `internal_operator` solamente por anexo.
- `POST /applications/:id/risk-assessments`: `internal_operator`.
- `GET /risk-assessments/:id`: `internal_operator`.

### Matching

- `GET /risk-assessments/:id/matches`: `internal_operator`.
- `POST /risk-assessments/:id/matches`: `internal_operator`.

Los matches son internos. Applicant no debe consultar `application_matches` directamente.

### Application Decisions

- `POST /applications/:id/decision`: `internal_operator`. Crea `application_decision`.
- `PATCH /application-decisions/:id/publish`: `internal_operator`. Publica decision, asigna `published_at`, cambia solicitud a `decision_published` y despublica automaticamente cualquier decision vigente anterior de la misma solicitud dentro de la misma transaccion.
- `GET /applications/:id/decision`: ambos roles. Operador ve completa; applicant ve solo decision publicada y propia.

### Credit File

- `GET /applications/:id/credit-file`: `internal_operator` ve expediente completo. Applicant solo debe recibir campos permitidos y no debe recibir riesgo interno, matches internos, reglas ni auditoria.

### Audit Logs

- `GET /audit-logs`: `internal_operator`.

No exponer secretos ni valores sensibles completos.

## Contratos Principales

### Registro Applicant

Request:

```json
{
  "fullName": "Juan Perez",
  "email": "juan@empresa.com",
  "password": "Password123!"
}
```

Response:

```json
{
  "data": {
    "id": "uuid",
    "fullName": "Juan Perez",
    "email": "juan@empresa.com",
    "role": "applicant"
  }
}
```

### Validacion de Necesidad

```json
{
  "validatedNeedType": "working_capital",
  "notes": "El solicitante eligio equipment, pero la descripcion corresponde a mantenimiento operativo."
}
```

### Decision Final

```json
{
  "riskAssessmentId": "uuid",
  "selectedMatchId": "uuid",
  "decisionStatus": "prequalified",
  "approvedAmount": "250000.00",
  "approvedTermMonths": 12,
  "estimatedMonthlyPayment": "24500.00",
  "publicMessage": "Tu solicitud fue revisada y puede avanzar con una opcion de capital de trabajo.",
  "internalNotes": "Se eligio capital de trabajo porque el uso real es mantenimiento operativo."
}
```

### Decision para Applicant

```json
{
  "data": {
    "decisionStatus": "prequalified",
    "productName": "Capital de trabajo",
    "approvedAmount": "250000.00",
    "approvedTermMonths": 12,
    "estimatedMonthlyPayment": "24500.00",
    "publicMessage": "Tu solicitud fue revisada y puede avanzar con una opcion de capital de trabajo.",
    "publishedAt": "2026-06-14T10:00:00.000Z"
  }
}
```

No incluir `riskScore`, `riskLevel` interno, `internalNotes`, `scoreWeight`, reglas, DSCR detallado, `application_matches` ni `auditLogs`.

## Diferencia por Rol

- `internal_operator` debe ver analisis interno, matches, indicadores, porcentajes, razones, documentos, auditoria, notas internas y decision completa.
- `applicant` debe ver solo sus propios datos, documentos, estado y decision final publicada desde `application_decisions`.
