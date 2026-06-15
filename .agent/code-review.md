# Checklist de Code Review

## Seguridad

- Validar que todo endpoint protegido exige JWT.
- Validar que errores de auth no revelan credencial especifica fallida.
- Validar que no se exponen `password_hash`, tokens ni secretos.
- Validar que documentos se descargan desde endpoint protegido.

## Permisos

- Validar roles por endpoint.
- Validar ownership de applicant por `companies.applicant_user_id`.
- Validar que applicant no use `created_by_user_id` como propiedad.
- Validar que applicant no ve datos internos.
- Validar que applicant solo ve eventos publicables de `status-history`.
- Validar que applicant no edita datos criticos despues de `ready_for_analysis`.

## Ownership

- Companies: applicant solo propias.
- Applications: ownership por company.
- Documents: ownership por application.
- Decisions: applicant solo propia y publicada.

## Validaciones

- RFC por `business_type`.
- Montos no negativos y montos/plazos requeridos mayores a cero.
- Deuda condicional.
- Garantia condicional.
- Documento uploaded con metadatos completos.
- Documento reviewed con usuario y fecha.
- `between` con `condition_value_to`.

## Prisma y Migraciones

- Schema coincide con `docs/base-datos.md`.
- Enums incluyen anexos.
- `application_decisions` existe.
- Campos `validated_need_type` existen.
- Modulo backend de solicitudes se llama `financing-applications`.
- Rutas publicas de solicitudes usan `/applications`.
- Indices y constraints criticos existen.
- Migraciones aplican en base limpia.
- Seed crea roles, usuarios demo, documentos, productos, reglas y decision status.

## API

- Respuesta y errores siguen convencion definida.
- `FILE_VALIDATION_ERROR` se usa para archivo invalido por extension, MIME, tamano, nombre o validacion.
- `DOCUMENT_UPLOAD_ERROR` se usa para fallas de guardado, procesamiento, hash, filesystem o persistencia de metadatos.
- Swagger documenta endpoints nuevos.
- Applicant no consulta `risk_assessments` ni `application_matches`.
- Decision publicada sale de `application_decisions`.
- Endpoints de documentos no exponen rutas internas.

## Frontend

- Rutas protegidas por rol.
- Applicant no ve pantallas internas.
- Operador ve expediente completo.
- Pantalla applicant muestra leyenda de pre-evaluacion.
- Dashboard applicant sin decision publicada muestra estado, documentos, rechazos y solicitud en revision sin datos internos.
- Errores indican campo o seccion a corregir.

## Documentos

- Upload valida extension, MIME, tamano, nombre y permiso.
- Storage usa `uploads/applications/{application_id}/`.
- BD guarda ruta y metadatos, no binario.
- Reemplazo de rechazado actualiza mismo registro.
- Reemplazo limpia revision previa y audita.

## Riesgo

- No calcula sin precondiciones.
- Usa Decimal.
- Guarda `input_snapshot`.
- Genera razones.
- Cada recalculo crea nuevo registro.
- Applicant no accede a analisis interno.

## Matching

- Requiere `risk_assessment_id`.
- Usa productos y reglas activas.
- Usa `validated_need_type` si existe.
- Descarta productos que incumplen requisitos obligatorios.
- Penaliza productos viables con peor ajuste a `validated_need_type`.
- Descarta factoraje si exige facturas y `has_invoices` no es `true`.
- Descarta arrendamiento si exige equipo/adquisicion de activo y no existe necesidad validada compatible.
- Permite credito simple como alternativa general solo si cumple capacidad, monto, plazo y riesgo.
- Bloquea activacion o excluye del matching productos activos sin `estimated_annual_rate`.
- Score queda en 0..100.
- No publica automaticamente.

## Decisiones

- `application_decisions` separa decision de matches.
- Conserva historial de decisiones.
- `selected_match_id` pertenece al mismo `risk_assessment_id`.
- `public_message` no tiene datos internos.
- Solo una decision publicada vigente por solicitud.
- Publicar una nueva decision despublica automaticamente la vigente anterior en la misma transaccion.
- Publicar cambia estado a `decision_published`.
- Flujo de cierre usa `matched -> decision_published -> closed`.
- Applicant solo ve publicadas propias.

## Auditoria

- Audita registro, login, creacion/edicion critica, revision documental, reemplazo documental, calculo de riesgo, matching, decision y publicacion.
- No audita todo indiscriminadamente.
- No guarda secretos ni contenido de documentos.

## Pruebas

- Auth.
- Permisos.
- Acceso cruzado.
- Documentos.
- Riesgo.
- Matching.
- Decision publicada.
- Auditoria.
- Flujos integrales.

## README

- Instrucciones locales actualizadas.
- Variables de entorno documentadas.
- Usuarios demo documentados cuando existan.
- Estado de fase actualizado.
- Pendientes de aclaracion visibles.
