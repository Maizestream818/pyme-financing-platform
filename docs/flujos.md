# Flujos

## Flujo Applicant

1. Applicant abre registro publico.
2. Captura `fullName`, `email`, `password` y confirmacion.
3. Backend valida email unico, password y crea usuario con rol `applicant`.
4. Applicant inicia sesion.
5. Registra o actualiza su empresa.
6. Crea solicitud con monto, plazo, `funding_purpose`, urgencia y `need_type`.
7. Carga documentos propios.
8. Reemplaza documentos rechazados en el mismo registro cuando aplique.
9. Consulta estado, documentos y decision final publicada.

Applicant no debe revisar documentos, calcular riesgo, generar matching, ver `risk_score`, ver `application_matches`, ver reglas, ver auditoria ni ver solicitudes ajenas.

## Flujo Internal Operator

1. Internal operator inicia sesion.
2. Registra o localiza empresa.
3. Crea o consulta solicitud.
4. Inicializa checklist documental.
5. Carga o solicita documentos.
6. Revisa documentos.
7. Valida o corrige `validated_need_type`.
8. Marca solicitud como `ready_for_analysis` cuando datos y documentos minimos esten completos.
9. Ejecuta analisis de riesgo.
10. Genera matching financiero.
11. Revisa porcentajes, razones, indicadores y documentos.
12. Crea `application_decision`.
13. Publica decision al applicant.
14. La solicitud pasa de `matched` a `decision_published`.
15. Cierra el caso cuando corresponda.

## Flujo Documental

1. Se crea checklist con `application_documents` por requisito aplicable.
2. Cada documento inicia en `pending`.
3. Applicant u operador carga archivo.
4. Backend valida ownership, extension, MIME, tamano, nombre seguro y hash.
5. Backend guarda archivo en `uploads/applications/{application_id}/`.
6. Backend guarda ruta y metadatos en `application_documents`.
7. Estado cambia a `uploaded`.
8. Operador revisa.
9. Estado cambia a `approved`, `rejected` o `not_applicable`.
10. Si se rechaza, `notes` debe incluir motivo.

## Reemplazo de Documentos Rechazados

1. Applicant u operador carga nuevo archivo sobre un documento `rejected`.
2. Backend valida permisos y archivo.
3. Backend reemplaza metadatos en el mismo `application_document`.
4. Backend cambia `status` a `uploaded`.
5. Backend limpia revision previa (`reviewed_by_user_id`, `reviewed_at` y notas de revision cuando aplique).
6. Backend registra `audit_log` con accion `replace_document`.

No debe crearse otro `application_document` para el mismo requisito en el MVP.

## Flujo de Analisis de Riesgo

1. Validar `monthly_revenue > 0`, gastos, monto y plazo.
2. Validar `has_existing_debt` confirmado.
3. Si `has_existing_debt = true`, validar deuda y pago mensual mayores a cero.
4. Calcular porcentaje documental con documentos obligatorios aplicables aprobados / documentos obligatorios aplicables * 100.
5. Excluir `not_applicable` del denominador y no contar `uploaded` sin `approved`.
6. Bloquear calculo de riesgo si no hay documentos obligatorios aplicables.
7. Construir `input_snapshot`.
8. Calcular indicadores financieros.
9. Calcular `risk_score` limitado a 0..100.
10. Asignar `risk_level`.
11. Guardar nuevo `risk_assessment`.
12. Cambiar estado a `analyzed`.

No se debe sobrescribir historial.

## Flujo de Matching

1. Tomar `risk_assessment` valido.
2. Determinar `need_type_for_matching = validated_need_type` si existe; si no existe, usar `need_type`.
3. Cargar productos activos.
4. Validar elegibilidad minima.
5. Iniciar score base.
6. Aplicar `product_rules` activas.
7. Descartar productos que incumplen requisitos obligatorios.
8. Penalizar productos tecnicamente viables que no sean el mejor ajuste para `need_type_for_matching`.
9. Limitar `compatibility_score` a 0..100.
10. Guardar `application_matches` ligados al `risk_assessment_id`.
11. Cambiar estado a `matched`.

El producto con mayor porcentaje no se publica automaticamente.

## Flujo de Decision Final

1. Operador revisa `risk_assessment`.
2. Operador revisa `application_matches`.
3. Operador revisa `funding_purpose`, `need_type` y `validated_need_type`.
4. Operador crea `application_decision` con `decision_status`.
5. Si selecciona match, `selected_match_id` debe pertenecer al mismo `risk_assessment_id`.
6. Operador define `public_message`.
7. Operador publica decision.
8. Backend despublica automaticamente cualquier decision vigente anterior de la misma solicitud dentro de la misma transaccion.
9. Backend asigna `published_at`.
10. Backend cambia solicitud a `decision_published`.
11. Applicant puede consultar solo la decision publicada.

## Reapertura o Mas Informacion

Si falta informacion para decidir, el operador debe crear decision con `decision_status = needs_more_information` y mensaje publico solicitando aclaracion.

Una solicitud `closed` no se reabre en el MVP. Si se requiere un nuevo proceso despues de cerrar, se debe crear una nueva solicitud.

## Estados

- `draft`: solicitud creada y editable.
- `documents_pending`: faltan documentos o existen rechazados.
- `ready_for_analysis`: datos y documentos minimos listos.
- `analyzed`: existe `risk_assessment`.
- `matched`: existen `application_matches`.
- `decision_published`: existe decision publicada al applicant; es estado intermedio obligatorio entre `matched` y `closed`.
- `closed`: caso cerrado sin reapertura en el MVP.

## Transiciones Prohibidas

- `draft -> matched`.
- `closed -> documents_pending`.
- `matched -> draft`.
- `analyzed -> documents_pending` sin accion explicita de reapertura.

## Transicion Obligatoria de Decision

El flujo correcto de cierre con decision publicada es `matched -> decision_published -> closed`.
