# Fase 09: Auditoria, Pruebas y Cierre

## Objetivo

Completar auditoria, pruebas integrales, documentacion de ejecucion, datos demo, README final, verificacion y cierre del MVP.

## Archivos que Puede Modificar

- `apps/api/**` para auditoria y correcciones.
- `apps/web/**` para correcciones finales.
- `packages/database/**` para seeds o ajustes respaldados.
- `README.md`
- `docs/**`
- Pruebas automatizadas.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Alcance funcional para agregar integraciones externas.
- Funcionalidades fuera del MVP.

## Tareas Especificas

- Verificar auditoria de acciones sensibles.
- Confirmar que no se audita todo indiscriminadamente.
- Confirmar que no se guardan secretos ni contenido documental.
- Completar pruebas unitarias, integracion, API y flujo manual.
- Probar acceso cruzado entre applicants.
- Probar documentos, riesgo, matching y decisiones.
- Probar `status-history` publicable para applicant y completo para operador.
- Probar `matched -> decision_published -> closed`.
- Probar que `closed` no se reabre.
- Probar despublicacion automatica de decision anterior al publicar una nueva.
- Actualizar README con ejecucion local, variables, usuarios demo y flujo demo.
- Confirmar frontend en puerto `3000` y backend API en puerto `3001`.
- Confirmar pruebas automatizadas API con Jest + Supertest.
- Confirmar base de datos de prueba separada en Docker o schema separado para integracion.
- Verificar seed demo.
- Revisar checklist `.agent/code-review.md`.

## Criterios de Aceptacion

- Flujos principales funcionan desde clonacion del repo.
- Applicant no ve informacion interna.
- Operador ve informacion interna completa.
- Decision applicant sale de `application_decisions`.
- Documentos rechazados se reemplazan en mismo registro.
- Auditoria cubre acciones sensibles.
- Pruebas API automatizadas usan Jest + Supertest; Postman queda solo como apoyo manual.
- Pruebas minimas pasan o se reportan bloqueos concretos.
- README permite levantar y probar el proyecto.
- No existe Fase 10 en el plan oficial.

## Pruebas o Comandos de Verificacion

- Tests backend.
- Tests frontend.
- Tests API.
- Migracion desde base limpia.
- Seed.
- Flujo manual operador.
- Flujo manual applicant.
- Verificacion de acceso cruzado.

## Resultado Esperado

MVP cerrado, documentado y listo para demostracion tecnica.

## Que Debe Reportar Codex

- Resumen de pruebas.
- Flujos validados.
- Pendientes finales.
- Riesgos residuales.
- Confirmacion de no haber agregado alcance externo.
