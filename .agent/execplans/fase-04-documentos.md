# Fase 04: Documentos

## Objetivo

Implementar checklist documental, upload local, metadatos, revision, descarga protegida y reemplazo de documentos rechazados.

## Archivos que Puede Modificar

- `apps/api/src/modules/document-requirements/**`
- `apps/api/src/modules/application-documents/**`
- `apps/api/src/common/**` relacionado con archivos y validaciones.
- `uploads/**` solo como carpeta de desarrollo o fixtures no sensibles.
- Pruebas relacionadas.
- `.gitignore` para evitar versionar archivos cargados.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Modulos de riesgo, matching y decisiones.
- Frontend fuera de integraciones minimas si aun no corresponde.

## Tareas Especificas

- Crear endpoint de inicializacion de checklist.
- Usar rutas oficiales: `POST /applications/:id/documents/initialize`, `GET /applications/:id/documents`, `POST /application-documents/:id/upload`, `PATCH /application-documents/:id/review`, `GET /application-documents/:id/download`.
- Filtrar requisitos activos por aplicabilidad.
- Implementar upload `multipart/form-data`.
- Validar extension, MIME, tamano, nombre y permisos.
- Usar `FILE_VALIDATION_ERROR` cuando el archivo sea invalido por extension, MIME, tamano, nombre o validacion.
- Usar `DOCUMENT_UPLOAD_ERROR` cuando falle guardado, procesamiento, hash, filesystem o persistencia de metadatos.
- Generar `stored_filename` seguro.
- Guardar archivo en `uploads/applications/{application_id}/`.
- Calcular SHA-256.
- Guardar metadatos en `application_documents`.
- Implementar revision solo operador.
- Implementar download protegido.
- Implementar reemplazo de documento `rejected` en el mismo registro.
- Auditar upload, revision y reemplazo.

## Criterios de Aceptacion

- No se guardan binarios en BD.
- Applicant solo sube y descarga documentos propios.
- Operador puede revisar.
- Documento rechazado se reemplaza en el mismo registro.
- Reemplazo cambia estado a `uploaded`, actualiza metadatos y limpia revision previa.
- Descarga no expone ruta local.

## Pruebas o Comandos de Verificacion

- Upload PDF valido.
- Rechazo de extension invalida.
- Rechazo de archivo grande.
- Acceso cruzado bloqueado.
- Revision solo operador.
- Reemplazo de rechazado en mismo registro.
- Verificacion de `audit_log`.

## Resultado Esperado

Expediente documental seguro y listo para calcular porcentaje documental en riesgo.

## Que Debe Reportar Codex

- Endpoints documentales implementados.
- Validaciones de archivo.
- Pruebas ejecutadas.
- Rutas oficiales implementadas.
