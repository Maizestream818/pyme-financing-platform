# Fase 02: Auth y Roles

## Objetivo

Implementar autenticacion, JWT, roles, guards y registro publico de applicant.

## Archivos que Puede Modificar

- `apps/api/src/modules/auth/**`
- `apps/api/src/modules/users/**`
- `apps/api/src/modules/roles/**`
- `apps/api/src/common/guards/**`
- `apps/api/src/common/decorators/**`
- `apps/api/src/common/filters/**`
- `apps/api/src/app.module.ts`
- Pruebas relacionadas.
- `README.md` y `docs/api.md` si se fija convencion.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Modulos de empresas, documentos, riesgo, matching o decisiones salvo stubs estrictamente necesarios.
- Frontend completo de pantallas de negocio.

## Tareas Especificas

- Implementar `POST /auth/register`.
- Implementar `POST /auth/login`.
- Implementar `GET /auth/me`.
- Responder con formato oficial `data/meta/error`; no usar `success`.
- Permitir que `internal_operator` cree usuarios applicant desde flujo interno cuando sea necesario.
- Implementar hash seguro de password.
- Validar usuario activo.
- Emitir JWT.
- Crear guards de autenticacion y rol.
- Bloquear seleccion de rol en registro applicant.
- Auditar `register_applicant` y `login` segun politica de auditoria sensible.

## Criterios de Aceptacion

- Applicant puede registrarse con rol automatico.
- Applicant no puede elegir rol.
- Internal operator puede crear applicant sin permitir que el applicant elija rol.
- Login funciona para operador y applicant.
- Usuario inactivo no inicia sesion.
- Endpoints protegidos rechazan JWT ausente o invalido.
- No se expone `password_hash`.
- Las respuestas siguen `data/meta/error`.

## Pruebas o Comandos de Verificacion

- Pruebas unitarias de auth.
- Pruebas API de registro, login exitoso, login fallido, token invalido y usuario inactivo.
- Verificar que respuestas no revelan detalle de credencial fallida.

## Resultado Esperado

Base de seguridad lista para implementar ownership en empresas y solicitudes.

## Que Debe Reportar Codex

- Endpoints implementados.
- Guards creados.
- Pruebas ejecutadas.
- Convencion de respuesta aplicada o pendiente.
