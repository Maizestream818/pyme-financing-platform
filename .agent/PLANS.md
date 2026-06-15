# Planes de Ejecucion

## Plan Maestro

El desarrollo debe avanzar por fases. Cada fase debe tener alcance cerrado, archivos permitidos, validaciones y reporte final. No avanzar si una fase rompe permisos, base de datos, migraciones o flujo principal.

## Orden de Fases

1. Fase 0: repositorio e infraestructura.
2. Fase 1: base de datos y Prisma.
3. Fase 2: auth y roles.
4. Fase 3: empresas y solicitudes.
5. Fase 4: documentos.
6. Fase 5: productos y reglas.
7. Fase 6: riesgo y matching.
8. Fase 7: decisiones y expediente.
9. Fase 8: frontend.
10. Fase 9: auditoria, pruebas y cierre.

No crear Fase 10. La Fase 9 incluye auditoria, pruebas, cierre, README final y verificacion.

## Dependencias

- Fase 1 depende de Fase 0.
- Fase 2 depende de Fase 1.
- Fase 3 depende de Fase 2.
- Fase 4 depende de Fase 3.
- Fase 5 depende de Fase 1 y Fase 2.
- Fase 6 depende de Fase 3, Fase 4 y Fase 5.
- Fase 7 depende de Fase 6.
- Fase 8 depende de endpoints y contratos de fases anteriores.
- Fase 9 depende de todas las fases.

## Abrir una Fase

Antes de trabajar una fase, Codex debe:

1. Leer `AGENTS.md`.
2. Leer `docs/` relacionado.
3. Leer `.agent/execplans/fase-XX-*.md`.
4. Revisar estado del repo.
5. Confirmar pendientes que bloqueen implementacion.
6. Implementar solo el alcance de la fase.

## Cerrar una Fase

Para cerrar una fase, Codex debe:

1. Ejecutar pruebas o comandos de verificacion indicados.
2. Verificar permisos relevantes.
3. Actualizar README/docs si la fase lo exige.
4. Reportar archivos modificados.
5. Reportar pruebas ejecutadas.
6. Reportar pendientes de aclaracion.

## Completar una Fase

Una fase esta completa cuando:

- Entregables existen.
- Criterios de aceptacion pasan.
- No hay funcionalidades de fases futuras implementadas.
- No se rompieron restricciones globales.
- Las pruebas minimas pasan o se reporta por que no pudieron ejecutarse.

## Validaciones Antes de Avanzar

- `applicant` no accede a datos ajenos.
- `internal_operator` mantiene acceso operativo.
- La base refleja `docs/base-datos.md`.
- La API refleja `docs/api.md` o documenta pendiente.
- No se guardan documentos binarios en BD.
- Riesgo no se calcula sin precondiciones.
- Matching usa `validated_need_type` cuando existe.
- Decision applicant sale de `application_decisions`.
- Auditoria no guarda secretos.
- Modulo backend de solicitudes se llama `financing-applications` y rutas publicas usan `/applications`.
- `decision_published` es obligatorio entre `matched` y `closed`.
- Solicitudes `closed` no se reabren en el MVP.
- Pruebas API automatizadas usan Jest + Supertest.
