# Fase 06: Riesgo y Matching

## Objetivo

Implementar calculo de riesgo y generacion de matching financiero con `validated_need_type`.

## Archivos que Puede Modificar

- `apps/api/src/modules/risk-assessments/**`
- `apps/api/src/modules/application-matches/**`
- `apps/api/src/common/utils/**` para calculos financieros.
- Pruebas relacionadas.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Modulo `application-decisions` salvo dependencias de lectura no publicables.
- Frontend completo si Fase 8 no ha iniciado.

## Tareas Especificas

- Validar precondiciones de riesgo.
- Usar rutas oficiales: `POST /applications/:id/risk-assessments`, `GET /applications/:id/risk-assessments`, `GET /risk-assessments/:id`.
- Calcular flujo, margen, ratio monto/ingresos, pago estimado, deuda total, DSCR y capacidad.
- Calcular `document_completion_percentage` como documentos obligatorios aplicables aprobados / documentos obligatorios aplicables * 100.
- Excluir `not_applicable` del denominador.
- No contar `uploaded` sin `approved`.
- Bloquear riesgo si no hay documentos obligatorios aplicables.
- Redondear porcentaje documental a 2 decimales.
- Calcular `risk_score` y `risk_level`.
- Guardar `risk_reasons`.
- Guardar `input_snapshot`.
- Crear nuevo registro en cada recalculo.
- Generar matches solo desde `risk_assessment_id`.
- Usar `validated_need_type` si existe; si no, usar `need_type`.
- Descartar productos que incumplen requisitos obligatorios.
- Penalizar productos tecnicamente viables que no sean el mejor ajuste para `validated_need_type`.
- Descartar factoraje si exige facturas y `has_invoices` no es `true`.
- Descartar arrendamiento si exige equipo/adquisicion de activo y no existe necesidad validada compatible.
- Permitir credito simple como alternativa general si cumple capacidad, monto, plazo y riesgo.
- Excluir del matching productos activos sin `estimated_annual_rate` con error interno controlado.
- Guardar razon, tasa usada, pago mensual estimado y DSCR por producto cuando aplique.
- Bloquear applicant a riesgo y matching interno.

## Criterios de Aceptacion

- Riesgo no calcula con datos incompletos.
- Riesgo no calcula con `has_existing_debt = NULL`.
- Riesgo no calcula con `monthly_revenue = 0`.
- Riesgo no calcula si no hay documentos obligatorios aplicables.
- Cada recalculo crea historial.
- Matching no se genera sin `risk_assessment_id`.
- Matching no duplica producto por analisis.
- Applicant no ve analisis ni matches internos.

## Pruebas o Comandos de Verificacion

- Pruebas unitarias de formulas.
- Pruebas de precondiciones.
- Pruebas de score 0..100.
- Pruebas de nuevo historial.
- Pruebas de matching con y sin `validated_need_type`.
- Pruebas de descarte por requisito obligatorio.
- Pruebas de producto sin `estimated_annual_rate`.
- Pruebas de bloqueo applicant.

## Resultado Esperado

Operador puede analizar riesgo y generar opciones internas, sin publicar nada al applicant.

## Que Debe Reportar Codex

- Formulas implementadas.
- Precondiciones implementadas.
- Pruebas ejecutadas.
- Productos descartados, penalizados y excluidos segun reglas definitivas.
