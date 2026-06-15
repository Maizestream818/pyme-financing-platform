# Fase 00: Repositorio e Infraestructura

## Objetivo

Preparar el monorepo y la infraestructura local base para iniciar desarrollo. Esta fase no debe implementar funcionalidades de negocio.

## Archivos que Puede Modificar

- `package.json`
- `pnpm-workspace.yaml` o configuracion equivalente definida para el monorepo.
- `apps/web/**`
- `apps/api/**`
- `packages/database/**`
- `docker-compose.yml`
- `.env.example`
- `.gitignore`
- `README.md`
- `docs/**` solo si se actualiza informacion de ejecucion.

## Archivos que No Debe Modificar

- `Documentacion/**`
- `.agent/execplans/**` salvo ajuste documental autorizado.
- Migraciones reales si la Fase 1 no ha iniciado.
- Codigo de reglas de negocio, riesgo, matching, documentos o decisiones.

## Tareas Especificas

- Crear estructura `apps/web`, `apps/api`, `packages/database` y `uploads`.
- Configurar monorepo.
- Crear Docker Compose con servicios `postgres`, `pgadmin`, `api` y `web`.
- Configurar frontend en puerto oficial `3000`.
- Configurar backend API en puerto oficial `3001`.
- Crear `.env.example` con variables necesarias sin secretos reales.
- Preparar scripts base de desarrollo.
- Documentar comandos locales en `README.md`.

## Criterios de Aceptacion

- El repo tiene estructura base esperada.
- Docker Compose define servicios base.
- `web` queda preparado para `http://localhost:3000`.
- `api` queda preparado para `http://localhost:3001/api`.
- Variables de entorno estan documentadas.
- No existen funcionalidades de negocio implementadas.
- `Documentacion/` permanece intacta.

## Pruebas o Comandos de Verificacion

- Validar sintaxis de archivos de configuracion.
- Ejecutar comando de instalacion solo si dependencias ya estan disponibles o si el usuario lo autoriza.
- Ejecutar `docker compose config` cuando Docker este disponible.

## Resultado Esperado

Repositorio listo para crear schema Prisma y migraciones en Fase 1.

## Que Debe Reportar Codex

- Archivos creados o modificados.
- Comandos ejecutados.
- Servicios configurados.
- Pendientes de aclaracion.
- Confirmacion de que no implemento funcionalidades de negocio.
