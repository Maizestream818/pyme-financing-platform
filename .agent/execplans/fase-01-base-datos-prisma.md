# Fase 01: Base de Datos y Prisma

## Objetivo

Implementar schema Prisma, migraciones y seeders segun `docs/base-datos.md`.

## Archivos que Puede Modificar

- `packages/database/**`
- `apps/api/prisma/**` si el proyecto decide ubicar Prisma dentro de API.
- `.env.example`
- `README.md`
- `docs/base-datos.md` solo para aclaraciones detectadas.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Frontend de negocio.
- Controladores o servicios de API de negocio.
- Logica de riesgo, matching o decisiones fuera de schema/seed.

## Tareas Especificas

- Crear schema con tablas finales.
- Incluir `application_decisions`.
- Agregar campos `validated_need_type` y trazabilidad en `financing_applications`.
- Crear enums documentados.
- Crear relaciones, indices y constraints criticos.
- Modelar historial de `application_decisions` con una sola decision publicada vigente por solicitud.
- Crear seed de roles, usuarios demo, requisitos documentales, productos, reglas y `decision_status`.
- Configurar Prisma Client.
- Preparar campos y restricciones para calcular `document_completion_percentage` con documentos obligatorios aplicables aprobados / documentos obligatorios aplicables * 100.

## Criterios de Aceptacion

- Migraciones aplican en base limpia.
- Seed carga datos minimos.
- `application_matches` apunta a `risk_assessment_id`.
- `application_decisions` existe y soporta publicacion.
- `application_decisions` conserva historial y permite despublicar decision vigente anterior en la misma transaccion al publicar nueva decision.
- No se guardan binarios de documentos.
- Se conserva maximo una decision publicada vigente por solicitud mediante constraint o validacion documentada.
- El modelo permite excluir `not_applicable` del denominador documental y bloquear riesgo cuando no haya documentos obligatorios aplicables.

## Pruebas o Comandos de Verificacion

- `prisma validate`.
- `prisma migrate dev` o comando equivalente de migracion.
- `prisma db seed` o comando equivalente de seed.
- Verificar tablas y enums creados.

## Resultado Esperado

Base lista para auth, roles y permisos.

## Que Debe Reportar Codex

- Modelos y enums implementados.
- Migraciones creadas.
- Seeds creados.
- Comandos ejecutados.
- Pendientes de integridad que requieran decision.
