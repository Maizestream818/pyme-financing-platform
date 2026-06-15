# Fase 07: Decisiones y Expediente

## Objetivo

Implementar decisiones finales publicables y expediente digital con vistas diferenciadas por rol.

## Archivos que Puede Modificar

- `apps/api/src/modules/application-decisions/**`
- `apps/api/src/modules/financing-applications/**` para estado `decision_published`.
- `apps/api/src/modules/status-history/**`
- Modulos existentes necesarios para exponer expediente digital sin crear estructura no documentada.
- Pruebas relacionadas.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Calculos de riesgo y matching salvo lectura de datos existentes.
- Frontend completo si Fase 8 no ha iniciado.

## Tareas Especificas

- Implementar creacion de `application_decision`.
- Responder con formato oficial `data/meta/error`; no usar `success`.
- Validar `risk_assessment_id`.
- Validar `selected_match_id` contra el mismo `risk_assessment_id`.
- Implementar publicacion.
- Al publicar, despublicar automaticamente la decision vigente anterior de la misma solicitud dentro de la misma transaccion.
- Asignar `published_at`.
- Cambiar solicitud a `decision_published`.
- Mantener `decision_published` como estado intermedio obligatorio entre `matched` y `closed`.
- Auditar decision y publicacion.
- Implementar respuesta interna completa para operador.
- Implementar respuesta publica limitada para applicant.
- Implementar expediente completo para operador y limitado para applicant.

## Criterios de Aceptacion

- Applicant no ve decision no publicada.
- Applicant solo ve decision propia.
- Applicant no recibe `risk_score`, matches internos, reglas, pesos, DSCR detallado, auditoria ni notas internas.
- Operador ve decision completa, riesgo, matches y trazabilidad.
- No se publica decision sin `public_message`.
- `prequalified` exige monto y plazo validos.
- Las respuestas siguen `data/meta/error`.
- Solo existe una decision publicada vigente por solicitud.
- Flujo de estado correcto: `matched -> decision_published -> closed`.
- Solicitudes `closed` no se reabren en el MVP.

## Pruebas o Comandos de Verificacion

- Crear decision valida.
- Rechazar decision sin analisis.
- Rechazar selected match de otro analisis.
- Publicar decision.
- Probar applicant antes y despues de publicar.
- Probar acceso cruzado.
- Verificar auditoria.

## Resultado Esperado

La salida al applicant queda controlada por `application_decisions`, no por `application_matches`.

## Que Debe Reportar Codex

- Endpoints de decision.
- Contrato de respuesta por rol.
- Pruebas ejecutadas.
- Confirmacion del flujo `matched -> decision_published -> closed`.
