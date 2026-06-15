# Base de Datos

## Tablas Finales

La base de datos debe incluir:

- `users`
- `roles`
- `companies`
- `financing_applications`
- `document_requirements`
- `application_documents`
- `financial_products`
- `product_rules`
- `risk_assessments`
- `application_matches`
- `application_decisions`
- `application_status_history`
- `audit_logs`

`application_decisions` es obligatoria por anexo. Debe separar recomendaciones internas de la respuesta oficial publicada al applicant.

## Relaciones

- `roles` 1:N `users`.
- `users` 1:N `companies` por `applicant_user_id` y `created_by_user_id`.
- `companies` 1:N `financing_applications`.
- `financing_applications` 1:N `application_documents`.
- `document_requirements` 1:N `application_documents`.
- `financing_applications` 1:N `risk_assessments`.
- `risk_assessments` 1:N `application_matches`.
- `financial_products` 1:N `application_matches`.
- `financial_products` 1:N `product_rules`.
- `financing_applications` 1:N `application_decisions`.
- `risk_assessments` 1:N `application_decisions`.
- `application_matches` 1:N opcional `application_decisions`.
- `financing_applications` 1:N `application_status_history`.
- `users` 1:N opcional `audit_logs`.

## Enums

- `business_type`: `pfae`, `persona_moral`.
- `urgency_level`: `low`, `medium`, `high`.
- `need_type`: `working_capital`, `equipment`, `invoices`, `expansion`, `other`.
- `application_status`: `draft`, `documents_pending`, `ready_for_analysis`, `analyzed`, `matched`, `closed`, `decision_published`.
- `document_status`: `pending`, `uploaded`, `approved`, `rejected`, `not_applicable`.
- `risk_level`: `low`, `medium`, `high`.
- `credit_history_status`: `unknown`, `good`, `regular`, `bad`, `not_available`.
- `rule_operator`: `equals`, `not_equals`, `gte`, `lte`, `between`, `contains`.
- `rule_field`: `requested_amount`, `desired_term_months`, `urgency_level`, `need_type`, `years_operating`, `monthly_revenue`, `monthly_expenses`, `employee_count`, `document_completion_percentage`, `risk_level`, `credit_history_status`, `has_invoices`, `has_existing_debt`, `has_collateral`, `has_guarantor`, `debt_service_coverage_ratio`.
- `decision_status`: `under_review`, `prequalified`, `not_prequalified`, `needs_more_information`.
- `audit_action`: `create`, `update`, `deactivate`, `status_change`, `upload_document`, `review_document`, `calculate_risk`, `generate_matches`, `login`, `publish_decision`, `validate_need_type`, `register_applicant`, `replace_document`.

## Campos Criticos

### `companies`

- `rfc` debe ser unico.
- `applicant_user_id` puede ser `NULL` para flujo interno.
- Si `applicant_user_id` existe, debe apuntar a usuario con rol `applicant`.
- `created_by_user_id` registra captura, no propiedad.

### `financing_applications`

- `requested_amount` debe ser mayor a cero.
- `desired_term_months` debe ser mayor a cero.
- `need_type` es la necesidad declarada.
- `validated_need_type` es la necesidad validada por operador.
- `need_type_validated_by_user_id`, `need_type_validated_at` y `need_type_validation_notes` deben registrar quien, cuando y por que se valido.
- Si `validated_need_type` existe, el matching debe usarlo; si no existe, debe usar `need_type`.

### `application_documents`

- Debe existir una combinacion unica `application_id + document_requirement_id`.
- Los archivos rechazados se reemplazan en el mismo registro.
- Al reemplazar, se actualizan metadatos, se cambia `status` a `uploaded`, se limpian datos de revision anterior y se audita `replace_document`.

### `risk_assessments`

- Cada recalculo crea un registro nuevo.
- `input_snapshot` es obligatorio.
- `risk_score` y `document_completion_percentage` deben estar entre 0 y 100.
- `document_completion_percentage` debe calcularse como documentos obligatorios aplicables aprobados / documentos obligatorios aplicables * 100.
- Los documentos `not_applicable` se excluyen del denominador.
- Los documentos `uploaded` sin `approved` no cuentan como completos.
- Si no hay documentos obligatorios aplicables, bloquear calculo de riesgo.
- Redondear `document_completion_percentage` a 2 decimales.

### `application_matches`

- Debe apuntar a `risk_assessment_id`, no solo a `application_id`.
- Debe existir `UNIQUE(risk_assessment_id, financial_product_id)`.
- `compatibility_score` debe estar entre 0 y 100.

### `application_decisions`

- Debe pertenecer a `application_id`.
- Debe basarse en `risk_assessment_id` valido.
- `selected_match_id` es opcional y debe pertenecer al mismo `risk_assessment_id`.
- `decision_status` define la respuesta oficial.
- `public_message` es obligatorio y no debe incluir score interno, pesos, reglas ni informacion sensible.
- `internal_notes` solo debe ser visible para `internal_operator`.
- `is_published_to_applicant` controla visibilidad al applicant.
- `published_at` es obligatorio cuando `is_published_to_applicant = true`.
- Debe existir como maximo una decision publicada vigente por solicitud.
- `application_decisions` debe conservar historial.
- Al publicar una nueva decision, el backend debe despublicar automaticamente la decision vigente anterior de la misma solicitud dentro de la misma transaccion.

## Reglas de Integridad

- No guardar contrasenas en texto plano.
- No guardar binarios de documentos en PostgreSQL.
- No permitir montos negativos.
- No calcular riesgo si `monthly_revenue <= 0`.
- No calcular riesgo si `has_existing_debt` es `NULL`.
- No calcular riesgo si no existen documentos obligatorios aplicables.
- Si `has_existing_debt = true`, `existing_debt_amount` y `monthly_debt_payment` deben ser mayores a cero.
- Si `has_collateral = true`, `collateral_type` y `collateral_estimated_value` son obligatorios.
- Si `document_status = uploaded`, deben existir archivo, metadatos, usuario y fecha de carga.
- Si `document_status = approved` o `rejected`, deben existir usuario y fecha de revision.
- Si `product_rules.operator = between`, `condition_value_to` debe existir.

## Indices

Crear indices para:

- `users.email`, `users.role_id`.
- `roles.name`.
- `companies.rfc`, `companies.business_type`, `companies.applicant_user_id`.
- `financing_applications.company_id`, `financing_applications.status`, `financing_applications.created_by_user_id`.
- `application_documents.application_id`, `application_documents.document_requirement_id`, `application_documents.uploaded_by_user_id`, `application_documents.reviewed_by_user_id`.
- `risk_assessments.application_id, calculated_at`, `risk_assessments.calculated_by_user_id`.
- `application_matches.risk_assessment_id`, `application_matches.financial_product_id`.
- `product_rules.financial_product_id`.
- `application_decisions.application_id`, `application_decisions.application_id + is_published_to_applicant`.
- Constraint parcial o validacion transaccional debe garantizar una sola decision publicada vigente por solicitud.
- `application_status_history.application_id, changed_at`.
- `audit_logs.entity_name, entity_id`, `audit_logs.user_id, created_at`.

## Datos Semilla

El seed debe crear:

- Roles `internal_operator` y `applicant`.
- Un operador demo.
- Un applicant demo.
- Requisitos documentales: identificacion, RFC, comprobante domicilio, estados de cuenta, acta, poder, autorizacion de buro, declaracion fiscal o estados financieros, facturas y cotizacion de equipo.
- Productos: Factoraje, Credito simple, Capital de trabajo, Linea revolvente y Arrendamiento.
- Reglas por necesidad, facturas, urgencia, antiguedad, riesgo y DSCR.
- Enum `decision_status`.

## Edicion y Eliminacion

- `users`: no borrar con actividad; desactivar.
- `roles`: conservar `internal_operator` y `applicant`.
- `financial_products`: no borrar si tiene reglas o historial; usar `is_active`.
- `product_rules`: editar o desactivar.
- `document_requirements`: desactivar si ya se uso.
- `companies`: evitar borrado si tiene solicitudes.
- `financing_applications`: evitar borrado si tiene documentos, analisis, matches, decisiones o historial.
- `audit_logs`: no borrar desde la aplicacion.

## Que Guardar y Que No Guardar

Debe guardarse:

- Metadatos de documentos, ruta local, hash, tamano, MIME y usuarios involucrados.
- `input_snapshot` de cada analisis.
- Razones de riesgo y matching.
- Decision publicada y mensaje publico.
- Auditoria de acciones sensibles con valores controlados.

No debe guardarse:

- `password_hash` en auditoria.
- Tokens.
- Contraseñas en texto plano.
- Contenido binario de documentos en base de datos.
- Contenido completo de documentos en auditoria.
- Datos sensibles completos cuando baste con valores enmascarados.

## Reglas de Decision Publicada

- Conservar historial de decisiones.
- Permitir solo una decision publicada vigente por solicitud.
- Para el MVP, publicar una nueva decision debe despublicar automaticamente la anterior dentro de la misma transaccion.
