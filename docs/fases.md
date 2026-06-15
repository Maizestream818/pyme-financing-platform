# Fases

## Regla General

Cada fase debe terminar con entregables verificables, pruebas basicas y documentacion actualizada. No avanzar si se rompen autenticacion, permisos, datos, migraciones o flujo principal.

El plan oficial usa Fase 0 a Fase 9. No crear Fase 10.

## Fase 0: Repositorio e Infraestructura

Objetivo: crear monorepo, configuracion base, Docker Compose, `.env.example`, README inicial y estructura de carpetas.

Entregables:

- `apps/web`.
- `apps/api`.
- `packages/database`.
- `uploads`.
- `docker-compose.yml`.
- `.env.example`.
- Scripts base.

Criterio de salida: Docker Compose levanta servicios base sin errores.

No debe implementar reglas de negocio.

## Fase 1: Base de Datos y Prisma

Objetivo: crear schema Prisma, migraciones y seeders.

Entregables:

- Modelos de todas las tablas finales.
- Enums.
- Indices.
- Constraints.
- Seed de roles, usuarios demo, requisitos, productos, reglas y decision status.

Criterio de salida: migraciones aplican en base limpia y seed carga datos iniciales.

No debe implementar endpoints de negocio.

## Fase 2: Auth y Roles

Objetivo: implementar login, JWT, usuarios, roles, guards y registro applicant.

Entregables:

- Login.
- `GET /auth/me`.
- Registro publico applicant.
- Creacion interna de usuarios applicant por `internal_operator`.
- Guards de autenticacion y roles.
- Password hash.
- Pruebas de login, registro, usuario inactivo y token invalido.

Criterio de salida: `internal_operator` y `applicant` inician sesion y acceden solo a rutas permitidas.

No debe permitir que applicant elija rol.

## Fase 3: Empresas y Solicitudes

Objetivo: implementar empresas, solicitudes, ownership y estado inicial.

Entregables:

- CRUD controlado de `companies`.
- CRUD controlado de `financing_applications`.
- Datos financieros.
- `applicant_user_id` y `created_by_user_id`.
- Validacion de `validated_need_type` por operador.
- Auditoria `validate_need_type`.
- Modulo backend `financing-applications` con rutas publicas `/applications`.
- Bloqueo de edicion critica para applicant despues de `ready_for_analysis`.
- `status-history` completo para operador y eventos publicables para applicant.

Criterio de salida: applicant solo ve sus empresas y solicitudes; operador ve todas.

No debe calcular riesgo ni matching.

## Fase 4: Documentos

Objetivo: implementar checklist, carga local, metadatos, revision, descarga protegida y reemplazo de rechazados.

Entregables:

- Inicializacion de checklist.
- Upload seguro.
- Download protegido.
- Revision documental.
- Reemplazo en el mismo `application_document`.
- Auditoria `upload_document`, `review_document`, `replace_document`.

Criterio de salida: archivo se guarda localmente y BD conserva ruta/metadatos; applicant no accede a documentos ajenos.

No debe guardar binarios en base de datos.

## Fase 5: Productos y Reglas

Objetivo: implementar catalogo de productos y reglas activas.

Entregables:

- CRUD controlado de `financial_products`.
- CRUD controlado de `product_rules`.
- Desactivacion con `is_active`.
- Validacion de operadores, valores y pesos.

Criterio de salida: operador crea/edita/desactiva; applicant no accede.

No debe borrar historial.

## Fase 6: Riesgo y Matching

Objetivo: implementar calculo de riesgo y matching financiero.

Entregables:

- Calculo de indicadores.
- `input_snapshot`.
- Historial de `risk_assessments`.
- Matching por `risk_assessment_id`.
- Uso de `validated_need_type` con fallback a `need_type`.
- Descarte de productos que incumplen requisitos obligatorios.
- Penalizacion de productos viables con peor ajuste a `validated_need_type`.
- Exclusion o bloqueo de productos activos sin `estimated_annual_rate`.
- Bloqueo de applicant a riesgo y matches internos.

Criterio de salida: no se calcula si faltan precondiciones; cada recalculo crea registro nuevo; cada matching pertenece al analisis correcto.

No debe publicar decision automaticamente.

## Fase 7: Decisiones y Expediente

Objetivo: implementar `application_decisions` y expediente digital por rol.

Entregables:

- Crear decision.
- Publicar decision.
- Vista interna completa para operador.
- Vista limitada para applicant.
- Estado `decision_published`.
- Auditoria `publish_decision`.
- Historial de decisiones.
- Despublicacion automatica de decision vigente anterior dentro de la misma transaccion al publicar una nueva.
- Flujo de estado `matched -> decision_published -> closed`.

Criterio de salida: applicant ve la decision solo despues de publicada y nunca ve riesgo ni matches internos.

No debe tomar `application_matches` como respuesta directa al applicant.
No debe reabrir solicitudes `closed`; un nuevo proceso requiere una nueva solicitud.

## Fase 8: Frontend

Objetivo: implementar pantallas principales integradas.

Entregables:

- Login.
- Registro applicant.
- Dashboard por rol.
- Dashboard applicant sin decision publicada con estado, documentos, motivos de rechazo y mensaje de solicitud en revision.
- Empresas.
- Solicitudes.
- Documentos.
- Riesgo y matching para operador.
- Decision operador.
- Decision applicant.
- Productos, reglas y auditoria para operador.

Criterio de salida: flujos principales funcionan desde navegador con restricciones por rol.

No debe ocultar fallas de autorizacion backend con solo UI.

## Fase 9: Auditoria, Pruebas y Cierre

Objetivo: cerrar auditoria, pruebas integrales, README final, verificacion y preparacion de entrega.

Entregables:

- Audit logs de acciones sensibles.
- Pruebas unitarias, integracion, API y flujo manual.
- Documentacion de ejecucion.
- Datos demo.
- README final.
- Verificacion final del MVP.

Criterio de salida: el repo se clona, levanta y demuestra flujo completo.

No debe agregar integraciones externas ni funcionalidades fuera del MVP.
