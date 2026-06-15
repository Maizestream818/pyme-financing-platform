# Fase 03: Empresas y Solicitudes

## Objetivo

Implementar empresas, solicitudes, ownership, datos financieros, estados iniciales y validacion de necesidad por operador.

## Archivos que Puede Modificar

- `apps/api/src/modules/companies/**`
- `apps/api/src/modules/financing-applications/**`
- `apps/api/src/modules/status-history/**`
- `apps/api/src/common/guards/ownership.guard.ts`
- Pruebas relacionadas.
- `README.md` si cambian comandos o rutas.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Modulos de documentos, productos, riesgo, matching y decisiones.
- Schema Prisma salvo ajustes estrictamente necesarios respaldados por `docs/base-datos.md`.

## Tareas Especificas

- Implementar CRUD controlado de companies.
- Responder con formato oficial `data/meta/error`; no usar `success`.
- Asignar `applicant_user_id` desde JWT cuando applicant crea empresa.
- Conservar `created_by_user_id`.
- Implementar CRUD controlado de solicitudes.
- Mantener carpeta/modulo backend `financing-applications` y rutas publicas `/applications`.
- Validar `requested_amount`, `desired_term_months`, `need_type` y ownership de `company_id`.
- Implementar actualizacion de datos financieros.
- Implementar maquina basica de estados documentada.
- Bloquear edicion critica de applicant despues de `ready_for_analysis`.
- Implementar `PATCH /applications/:id/validated-need-type` solo operador.
- Implementar `status-history` completo para operador y eventos publicables para applicant.
- Auditar `validate_need_type`.

## Criterios de Aceptacion

- Applicant lista solo empresas y solicitudes propias.
- Operador lista todas.
- Applicant no asigna ownership arbitrario.
- No se permite `draft -> matched`.
- `validated_need_type` guarda usuario, fecha y notas.
- Applicant no edita datos criticos despues de `ready_for_analysis`.
- Applicant solo ve eventos publicables de `status-history`.
- No se calcula riesgo ni matching en esta fase.
- Las respuestas siguen `data/meta/error`.

## Pruebas o Comandos de Verificacion

- Pruebas API de CRUD companies.
- Pruebas API de CRUD applications.
- Prueba de acceso cruzado Applicant A vs Applicant B.
- Prueba de validacion de necesidad solo operador.
- Prueba de transicion invalida.

## Resultado Esperado

Flujo base de empresa y solicitud listo para documentos.

## Que Debe Reportar Codex

- Endpoints implementados.
- Reglas de ownership aplicadas.
- Pruebas ejecutadas.
- Pendientes de estados, si aparecen durante la implementacion.
