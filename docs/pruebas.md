# Pruebas

## Estrategia

Las pruebas deben cubrir funciones puras, servicios con base de datos, endpoints, permisos, archivos y flujos manuales desde frontend. No avanzar de fase si las pruebas minimas de la fase fallan.

## Pruebas por Modulo

### Auth

- Login correcto.
- Login fallido.
- Usuario inactivo.
- Token faltante.
- Token invalido.
- Registro applicant.
- Email duplicado en registro.
- Password invalido.
- Applicant no puede elegir rol.
- Internal operator puede crear usuario applicant desde flujo interno.

### Companies

- Crear empresa.
- Rechazar RFC duplicado.
- Validar RFC por `business_type`.
- Applicant ve solo propias.
- Operador ve todas.
- No usar `created_by_user_id` como ownership.

### Applications

- Crear solicitud con empresa valida.
- Bloquear `company_id` ajeno para applicant.
- Actualizar datos financieros.
- Validar monto y plazo.
- Validar deuda condicional.
- Validar `validated_need_type` solo por operador.
- Auditar `validate_need_type`.
- Bloquear edicion critica del applicant despues de `ready_for_analysis`.
- Confirmar que `closed` no se reabre y que un nuevo proceso requiere nueva solicitud.
- Applicant solo ve eventos publicables de `status-history`.

### Documents

- Inicializar checklist.
- Subir PDF valido.
- Rechazar extension invalida.
- Rechazar archivo demasiado grande.
- Rechazar nombre inseguro.
- Descargar solo por endpoint protegido.
- Aprobar/rechazar solo operador.
- Rechazar aprobacion sin archivo.
- Reemplazar documento rechazado en el mismo registro.
- Auditar reemplazo.

### Products

- Crear producto.
- Editar producto.
- Desactivar producto.
- Bloquear applicant.
- Validar rangos de monto.
- No borrar producto con historial.

### Rules

- Crear regla valida.
- Rechazar operador incoherente.
- Exigir `condition_value_to` con `between`.
- Rechazar `score_weight` fuera de -100..100.
- Desactivar regla.

### Risk

- No calcular con `has_existing_debt = NULL`.
- No calcular con `monthly_revenue = 0`.
- No calcular si no hay documentos obligatorios aplicables.
- Calcular `document_completion_percentage` como aprobados obligatorios aplicables / obligatorios aplicables * 100.
- Excluir `not_applicable` del denominador.
- No contar `uploaded` sin `approved`.
- Redondear porcentaje documental a 2 decimales.
- Calcular con datos completos.
- Guardar `input_snapshot`.
- Guardar razones.
- Crear nuevo registro en recalculo.
- Bloquear applicant.

### Matching

- Generar matches por `risk_assessment_id`.
- Evitar duplicado de producto en el mismo analisis.
- Calcular score 0..100.
- Usar `validated_need_type` si existe.
- Usar `need_type` si no existe validacion.
- Descartar producto que incumple requisito obligatorio.
- Penalizar producto viable con peor ajuste a `validated_need_type`.
- Descartar factoraje si exige facturas y `has_invoices` no es `true`.
- Descartar arrendamiento si exige equipo/adquisicion de activo y no existe necesidad validada compatible.
- Permitir credito simple como alternativa general si cumple capacidad, monto, plazo y riesgo.
- Bloquear activacion o excluir del matching productos activos sin `estimated_annual_rate`.
- Bloquear applicant.

### Decisions

- Crear decision con `risk_assessment_id` valido.
- Rechazar `selected_match_id` que no pertenezca al mismo analisis.
- Publicar decision.
- Cambiar solicitud a `decision_published`.
- Despublicar decision vigente anterior dentro de la misma transaccion al publicar nueva decision.
- Applicant no ve decision no publicada.
- Applicant ve decision publicada propia.
- Applicant no recibe `riskScore`, matches, reglas, auditoria ni notas internas.
- Auditar publicacion.

### Status

- Permitir transiciones validas.
- Rechazar `draft -> matched`.
- Validar flujo `matched -> decision_published -> closed`.
- Rechazar reapertura de `closed`.
- Registrar `application_status_history`.

### Audit

- Crear `audit_log` en acciones sensibles.
- No guardar `password_hash`.
- No guardar tokens.
- No guardar contenido de documentos.
- Enmascarar valores sensibles cuando aplique.

## Flujos Integrales

- Flujo interno completo: operador crea empresa, solicitud, checklist, revisa documentos, valida necesidad, calcula riesgo, genera matching, crea decision, publica y consulta expediente.
- Flujo applicant: applicant se registra, inicia sesion, crea empresa, crea solicitud, sube documentos, reemplaza rechazado, consulta decision publicada.
- Acceso cruzado: Applicant A intenta acceder a empresa, solicitud, documento o decision de Applicant B y recibe `403` o `404`.
- Recalculo de riesgo: modificar datos permitidos, generar nuevo `risk_assessment`, generar nuevos matches sin sobrescribir historial.
- Producto desactivado: no aparece en nuevos matches y se conserva historial antiguo.

## Herramientas de Prueba

- Usar Jest + Supertest para pruebas automatizadas API.
- Usar Postman solo como apoyo manual.
- Usar base de datos de prueba separada en Docker o schema separado para pruebas de integracion.

## Definition of Done

Una fase esta terminada cuando:

- Compila backend y frontend si existen.
- Migraciones aplican desde base limpia cuando la fase toca BD.
- Seed carga datos minimos cuando aplica.
- Endpoints criticos validan rol y ownership.
- Errores siguen formato estandar definido.
- Acciones sensibles generan auditoria.
- Pruebas minimas pasan.
- README o docs explican como probar.
- No se agregaron funcionalidades fuera del MVP.
