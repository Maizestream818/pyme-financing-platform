# Pantallas

## Layout General

- Sidebar: debe mostrar navegacion segun rol.
- Header: debe mostrar usuario, rol y logout.
- Area principal: debe mostrar listas, formularios, expediente y dashboards.
- Alertas: deben explicar dato faltante, validacion y accion requerida.

El frontend no debe ser la fuente de seguridad. Backend debe bloquear permisos aunque el boton no exista.

## Pantallas Applicant

- Registro publico.
- Login.
- Dashboard propio.
- Empresas propias.
- Solicitudes propias.
- Detalle de solicitud propio.
- Documentos propios.
- Decision final publicada.

## Pantallas Internal Operator

- Login.
- Dashboard global.
- Empresas.
- Solicitudes.
- Detalle de solicitud y expediente digital.
- Documentos.
- Analisis de riesgo.
- Matching financiero.
- Decision final.
- Productos financieros.
- Reglas de producto.
- Auditoria.

## Datos Visibles por Rol

### Applicant

Debe ver:

- Sus empresas.
- Sus solicitudes.
- Estados de sus solicitudes.
- Checklist y estado documental propio.
- Motivos de rechazo documental.
- Decision final publicada desde `application_decisions`.
- Mensaje publico, producto publicado, monto, plazo, pago mensual y fecha de publicacion cuando existan.
- Si no existe decision publicada, debe ver estado actual, documentos pendientes, aprobados o rechazados, motivos de rechazo documental y mensaje "Solicitud en revision" o equivalente.

No debe ver:

- `risk_score`.
- `risk_level` interno.
- DSCR detallado.
- Pesos de reglas.
- `application_matches`.
- Comparacion interna de productos.
- `internal_notes`.
- `audit_logs`.
- Empresas o solicitudes de otros applicants.

### Internal Operator

Debe ver:

- Todas las empresas y solicitudes.
- Documentos, metadatos, revision y motivos.
- Analisis interno completo.
- `risk_assessments`.
- `application_matches`.
- Porcentajes, razones, tasa usada, pago estimado y DSCR por producto.
- Validacion de necesidad.
- Auditoria.
- Decision completa con notas internas y estado de publicacion.

## Acciones Permitidas

### Applicant

- Registrarse.
- Iniciar sesion.
- Crear y editar sus empresas.
- Crear solicitudes propias.
- Actualizar datos propios permitidos.
- Subir documentos.
- Reemplazar documentos rechazados propios.
- Descargar documentos propios mediante endpoint protegido.
- Consultar decision publicada propia.

### Internal Operator

- Gestionar usuarios internos segun alcance.
- Crear o editar empresas.
- Crear o editar solicitudes.
- Cambiar estados validos.
- Inicializar checklist.
- Subir, aprobar, rechazar o marcar documentos no aplicables.
- Validar `validated_need_type`.
- Calcular riesgo.
- Generar matching.
- Crear y publicar decision.
- Administrar productos y reglas.
- Consultar auditoria.

## Pantalla de Expediente Digital

La pantalla de expediente debe consolidar:

- Empresa.
- Solicitud.
- Documentos.
- Historial de estados.
- Ultimo analisis de riesgo.
- Matches internos.
- Decision final.

Para applicant, esta pantalla debe filtrar campos internos y mostrar solo estado, documentos propios y decision publicada.

Despues de `ready_for_analysis`, applicant no debe editar datos criticos de empresa, solicitud ni datos financieros. Applicant solo puede reemplazar documentos rechazados si el flujo lo permite. Cualquier correccion critica debe requerir intervencion de `internal_operator`.

## Pantalla de Decision Final

### Operador

Debe incluir:

- `decision_status`.
- Producto seleccionado cuando aplique.
- Monto aprobado/precalificado.
- Plazo.
- Pago mensual estimado.
- Mensaje publico.
- Notas internas.
- Estado de publicacion.
- Accion de publicar.

### Applicant

Debe incluir:

- Estado de decision.
- Producto publicado cuando exista.
- Monto, plazo y pago estimado cuando apliquen.
- `public_message`.
- `published_at`.
- Leyenda obligatoria: "Esta respuesta corresponde a una precalificacion o revision inicial. No representa una aprobacion final de credito ni una obligacion contractual."

## Dashboard Applicant Sin Decision Publicada

- Mostrar estado actual.
- Mostrar documentos pendientes, aprobados o rechazados.
- Mostrar motivos de rechazo documental.
- Mostrar mensaje "Solicitud en revision" o equivalente.
- No mostrar riesgo, scoring, matching, porcentajes, reglas ni informacion interna.
