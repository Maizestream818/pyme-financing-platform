# Fase 08: Frontend

## Objetivo

Implementar pantallas Next.js para los flujos principales por rol, consumiendo la API y respetando visibilidad.

## Archivos que Puede Modificar

- `apps/web/**`
- Cliente API compartido del frontend.
- Componentes UI.
- Pruebas frontend si existen.
- `README.md` para instrucciones de uso visual.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Backend salvo ajustes menores de contrato detectados y documentados.
- Base de datos salvo cambios autorizados por fases previas.

## Tareas Especificas

- Implementar login.
- Consumir backend oficial en `http://localhost:3001/api`.
- Implementar registro applicant.
- Implementar dashboard por rol.
- Implementar dashboard applicant sin decision publicada con estado actual, documentos pendientes/aprobados/rechazados, motivos de rechazo y mensaje de solicitud en revision.
- Implementar empresas.
- Implementar solicitudes.
- Implementar documentos.
- Implementar analisis de riesgo para operador.
- Implementar matching para operador.
- Implementar decision final para operador.
- Implementar vista de decision publicada para applicant.
- Implementar productos, reglas y auditoria para operador.
- Mostrar errores claros.
- Incluir leyenda de pre-evaluacion para applicant.

## Criterios de Aceptacion

- Applicant no ve pantallas internas.
- Applicant no ve porcentajes, riesgo, reglas, matches ni auditoria.
- Applicant no ve informacion interna cuando no existe decision publicada.
- Applicant no puede editar datos criticos despues de `ready_for_analysis`; solo puede reemplazar documentos rechazados si el flujo lo permite.
- Operador ve expediente completo.
- Botones por rol corresponden a permisos.
- Backend sigue bloqueando acciones aunque se manipule UI.
- Diseño prioriza claridad, tablas, estados y trazabilidad.
- El frontend debe esperar respuestas `data/meta/error`; no debe depender de `success`.

## Pruebas o Comandos de Verificacion

- Ejecutar build o lint de frontend.
- Probar login por rol.
- Probar flujo applicant.
- Probar dashboard applicant sin decision publicada.
- Probar bloqueo visual y de API para edicion critica posterior a `ready_for_analysis`.
- Probar flujo operador.
- Probar acceso directo a rutas no permitidas.
- Capturar evidencia manual si aplica.

## Resultado Esperado

Frontend usable para demostrar el MVP completo con vistas diferenciadas.

## Que Debe Reportar Codex

- Pantallas implementadas.
- Flujos probados.
- Comandos ejecutados.
- Limitaciones visuales pendientes.
