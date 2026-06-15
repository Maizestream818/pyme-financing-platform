# Reglas de Negocio

## Alcance

El sistema calcula pre-evaluacion, riesgo inicial y compatibilidad de productos. No aprueba credito real. La decision visible para applicant debe salir de `application_decisions`.

## Precondiciones para Riesgo

No calcular riesgo si falta cualquiera de estas condiciones:

- `monthly_revenue` y `monthly_expenses` existen y son mayores o iguales a cero.
- `monthly_revenue` es mayor a cero.
- `requested_amount` es mayor a cero.
- `desired_term_months` es mayor a cero.
- `has_existing_debt` esta confirmado.
- Si `has_existing_debt = true`, `existing_debt_amount` y `monthly_debt_payment` son mayores a cero.
- `has_invoices` esta confirmado cuando se evaluen productos de factoraje.
- `document_completion_percentage` esta calculado con la formula oficial.
- `input_snapshot` se construye antes de guardar.

## Formula Oficial de Avance Documental

`document_completion_percentage = documentos obligatorios aplicables aprobados / documentos obligatorios aplicables * 100`.

Reglas:

- Contar solo documentos obligatorios aplicables.
- Excluir documentos `not_applicable` del denominador.
- Contar como completos solo documentos `approved`.
- No contar documentos `uploaded` sin aprobacion.
- Bloquear calculo de riesgo si no hay documentos obligatorios aplicables.
- Redondear a 2 decimales.

## Formulas Financieras

- `estimated_cashflow = monthly_revenue - monthly_expenses`.
- `operating_margin = estimated_cashflow / monthly_revenue`.
- `requested_amount_to_revenue_ratio = requested_amount / monthly_revenue`.
- `total_monthly_debt_payment = monthly_debt_payment + estimated_monthly_payment`.
- `debt_service_coverage_ratio = estimated_cashflow / total_monthly_debt_payment`.
- `payment_capacity = estimated_cashflow - monthly_debt_payment`.

Para pago mensual con tasa:

```txt
monthly_rate = estimated_annual_rate / 100 / 12
if monthly_rate > 0:
  payment = requested_amount * monthly_rate / (1 - (1 + monthly_rate) ** -desired_term_months)
else:
  payment = requested_amount / desired_term_months
```

Usar Decimal o tipo equivalente; no usar float para calculos financieros.

## Scoring de Riesgo

Iniciar en 100 puntos, aplicar impactos y limitar a 0..100:

- Flujo negativo: `estimated_cashflow <= 0`, impacto `-35`.
- Margen bajo: `operating_margin < 0.10`, impacto `-15`.
- Monto alto: `requested_amount_to_revenue_ratio > 2`, impacto `-20`.
- DSCR critico: `debt_service_coverage_ratio <= 1`, impacto `-35`.
- DSCR ajustado: `DSCR > 1 y <= 1.5`, impacto `-15`.
- Antiguedad baja: `years_operating < 1`, impacto `-20`.
- Documentacion baja: `document_completion_percentage < 70`, impacto `-20`.
- Historial malo: `credit_history_status = bad`, impacto `-30`.
- Historial bueno: `credit_history_status = good`, impacto `+10`.
- Garantia: `has_collateral = true`, impacto `+5`.

## Clasificacion de Riesgo

- `75 - 100`: `low`.
- `50 - 74`: `medium`.
- `0 - 49`: `high`.

## Reglas Documentales

- Identificacion oficial: general.
- Constancia de Situacion Fiscal / RFC: general.
- Comprobante de domicilio: general.
- Estados de cuenta bancarios: general y especialmente si el producto exige estados de cuenta.
- Acta constitutiva: `business_type = persona_moral`.
- Poder del representante legal: persona moral o apoderado.
- Autorizacion de consulta de buro: cuando aplique historial crediticio.
- Facturas por cobrar: `need_type = invoices` o producto exige facturas.
- Cotizacion de maquinaria/equipo: `need_type = equipment`.

Documento rechazado no cuenta como completo.

## Matching

Proceso obligatorio:

1. Usar `need_type_for_matching = validated_need_type` si existe.
2. Si no existe `validated_need_type`, usar `need_type`.
3. Cargar productos activos.
4. Validar elegibilidad minima.
5. Iniciar `compatibility_score = 50`.
6. Aplicar reglas activas.
7. Penalizar `risk_level = high` cuando aplique.
8. Descartar productos que incumplen requisitos obligatorios.
9. Penalizar productos tecnicamente viables que no sean el mejor ajuste para `need_type_for_matching`.
10. Limitar score entre 0 y 100.
11. Guardar match con razon y calculos por producto.

## Productos por Necesidad Validada

- `working_capital`: Capital de trabajo, Credito simple, Linea revolvente.
- `equipment`: Arrendamiento, Credito simple.
- `invoices`: Factoraje, Capital de trabajo.
- `expansion`: Credito simple, Capital de trabajo, Linea revolvente.
- `other`: Credito simple o revision manual.

Factoraje no debe quedar como opcion principal salvo que la necesidad validada o el uso real justifique facturas por cobrar.

## Descarte y Penalizacion de Productos

- Descartar un producto si incumple un requisito obligatorio.
- Penalizar un producto si es viable tecnicamente pero no es el mejor ajuste para `validated_need_type`.
- Factoraje debe descartarse si el producto exige facturas y `has_invoices` no es `true`.
- Arrendamiento debe descartarse si no existe necesidad validada de equipo o adquisicion de activo cuando el producto lo exige.
- Credito simple puede quedar como alternativa general si cumple capacidad, monto, plazo y riesgo.

## Productos Sin Tasa Estimada

- Todo producto activo que participa en matching debe tener `estimated_annual_rate`.
- Si un producto no tiene `estimated_annual_rate`, el backend debe bloquear su activacion o excluirlo del matching con error interno controlado.
- No usar tasa base inventada.

## Reglas Iniciales de Producto

- Factoraje: `need_type equals invoices`, `+30`.
- Factoraje: `has_invoices equals true`, `+30`.
- Factoraje: `urgency_level equals high`, `+20`.
- Arrendamiento: `need_type equals equipment`, `+35`.
- Capital de trabajo: `need_type equals working_capital`, `+35`.
- Credito simple: `years_operating gte 2`, `+20`.
- Credito simple: `credit_history_status equals good`, `+20`.
- Cualquier producto: `risk_level equals high`, `-25`.
- Cualquier producto: `debt_service_coverage_ratio lte 1`, `-35`.

Cuando se evalue `need_type`, usar el valor efectivo de matching, no necesariamente el declarado por applicant.

## Application Decisions

- `application_matches` son opciones internas.
- `application_decisions` es la respuesta oficial.
- El operador debe crear la decision.
- El operador debe publicar la decision.
- Applicant solo ve decisiones publicadas propias.
- No publicar decision sin `risk_assessment_id` valido.
- Si `selected_match_id` existe, debe pertenecer al mismo `risk_assessment_id`.
- `public_message` no debe incluir datos internos.

## Estados de Decision

- `under_review`: el caso sigue en revision. Debe existir mensaje publico si se publica.
- `prequalified`: existe una respuesta positiva de pre-evaluacion. Debe incluir `approved_amount` y `approved_term_months` validos.
- `not_prequalified`: el operador determina que no avanza como pre-evaluacion.
- `needs_more_information`: faltan datos o aclaraciones; debe publicarse mensaje con informacion requerida.

## Condiciones para Publicar

- Decision creada por `internal_operator`.
- Solicitud accesible y no inconsistente.
- `risk_assessment_id` valido.
- `public_message` definido.
- `published_at` asignado.
- `is_published_to_applicant = true`.
- Estado de solicitud actualizado a `decision_published`.
- Auditoria `publish_decision` registrada.

## Casos Borde

- `monthly_revenue = 0`: bloquear riesgo.
- `has_existing_debt = null`: bloquear riesgo.
- Producto activo sin tasa estimada: bloquear activacion o excluir del matching con error interno controlado.
- Sin reglas activas: permitir producto elegible con score base explicado.
- Todos los productos inactivos: no generar matches y devolver mensaje operativo.
- Documento rechazado: no contar como completo.
- Solicitud cerrada: no recalcular riesgo ni matching; si se requiere un nuevo proceso, crear nueva solicitud.
