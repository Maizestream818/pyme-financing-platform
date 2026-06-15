# PyME Financing Platform

PyME Financing Platform es una plataforma web para pre-evaluacion de financiamiento PyME. El sistema debe registrar empresas, capturar solicitudes, gestionar documentos, calcular riesgo inicial, generar matching financiero con productos simulados y permitir que un operador interno publique una decision final al solicitante.

El proyecto resuelve la falta de un flujo trazable para ordenar datos financieros, documentos, riesgo y opciones de financiamiento antes de una revision humana. No aprueba creditos reales, no sustituye politicas formales de credito y no se conecta a instituciones financieras externas en el MVP.

## Alcance del MVP

El MVP debe cubrir:

- Autenticacion con roles `internal_operator` y `applicant`.
- Registro publico de `applicant` con `fullName`, `email` y `password`.
- Registro y edicion controlada de empresas PyME.
- Captura de solicitudes de financiamiento con monto, plazo, uso, urgencia, necesidad, deuda, garantia e historial crediticio simplificado.
- Checklist documental, carga local de archivos, metadatos, revision y reemplazo de documentos rechazados en el mismo registro.
- Analisis de riesgo con indicadores financieros, `risk_score`, `risk_level`, razones e `input_snapshot`.
- Matching financiero ligado a `risk_assessment_id`.
- Validacion de necesidad con `validated_need_type`; si existe, el matching debe usar ese valor, si no existe debe usar `need_type`.
- Decision final en `application_decisions`, creada y publicada por `internal_operator`.
- Vista limitada para `applicant` con sus datos propios, documentos, estado y decision final publicada.
- Auditoria solo de acciones sensibles.

## Stack Definido

- Frontend: Next.js + TypeScript.
- Backend: NestJS + TypeScript.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- Infraestructura local: Docker Compose.
- Autenticacion: JWT + roles.
- Documentacion API: Swagger / OpenAPI.
- Storage de documentos: carpeta local `uploads/`.

## Estructura Esperada

```txt
apps/
  web/
    package.json
    src/
  api/
    package.json
    src/
packages/
  database/
    package.json
    prisma/
uploads/
  applications/
docs/
Documentacion/
docker-compose.yml
.env.example
pnpm-workspace.yaml
package.json
README.md
AGENTS.md
```

`Documentacion/` conserva los PDFs originales. `docs/` contiene guias Markdown derivadas de esos PDFs para desarrollo con Codex y agentes.

## Ejecucion Local

La Fase 0 deja configurada la base del monorepo y la infraestructura local. Todavia no existe aplicacion Next.js ni NestJS implementada; eso corresponde a fases posteriores.

Puertos oficiales:

- Frontend: `http://localhost:3000`.
- Backend API: `http://localhost:3001/api`.
- PostgreSQL: `localhost:5432`.
- pgAdmin: `http://localhost:5050`.

Comandos de verificacion de Fase 0:

```bash
docker compose config
docker compose up
```

`docker compose up` levanta PostgreSQL, pgAdmin y contenedores placeholder para `api` y `web`. Los contenedores `api` y `web` quedan preparados con puertos oficiales, pero no ejecutan logica de aplicacion hasta que las fases correspondientes creen los scaffolds reales e instalen dependencias.

No ejecutar migraciones en Fase 0. No instalar dependencias sin autorizacion.

## Roles

- `internal_operator`: debe operar todos los casos, revisar documentos, ejecutar riesgo, generar matching, ver porcentajes, razones, auditoria, expediente completo y publicar decisiones finales.
- `applicant`: debe registrar su cuenta, crear o editar sus empresas, crear solicitudes, cargar o reemplazar documentos propios y consultar solo su informacion propia y la decision publicada.

## Flujo General

1. El applicant se registra o el operador trabaja un caso interno.
2. Se registra la empresa.
3. Se crea la solicitud.
4. Se inicializa el checklist documental.
5. El applicant u operador carga documentos.
6. El operador revisa documentos.
7. El operador valida o corrige la necesidad con `validated_need_type`.
8. El operador ejecuta analisis de riesgo.
9. El operador genera matching financiero.
10. El operador crea y publica una `application_decision`.
11. El applicant ve solo la decision final publicada.

## Fuera del MVP

El MVP no debe incluir IA generativa, chatbot, buro real, firma electronica, pagos, microservicios, almacenamiento cloud obligatorio, notificaciones por correo/SMS ni integraciones externas con instituciones financieras.

## Estado Actual

Fase 0 completada: repositorio e infraestructura base. El proyecto queda listo para iniciar Fase 1: Base de Datos y Prisma.

## Decisiones Operativas Cerradas

- La API debe responder con formato `data/meta/error`. No usar `success: true` ni `success: false`.
- Las rutas oficiales de documentos son las definidas en `docs/api.md`.
- Las rutas oficiales de riesgo son las definidas en `docs/api.md`.
- El plan oficial usa Fase 0 a Fase 9. No crear Fase 10.
- El modulo backend debe llamarse `financing-applications`; las rutas publicas deben usar `/applications`.
- `application_decisions` conserva historial y solo una decision puede estar publicada vigente por solicitud.
- Al publicar una nueva decision, el backend debe despublicar automaticamente la decision vigente anterior dentro de la misma transaccion.
- `decision_published` es estado intermedio obligatorio: `matched -> decision_published -> closed`.
- Una solicitud `closed` no se reabre en el MVP; se debe crear una nueva solicitud para un nuevo proceso.
- El dashboard applicant sin decision publicada debe mostrar estado, documentos, motivos de rechazo y mensaje de solicitud en revision, sin informacion interna.
- Despues de `ready_for_analysis`, applicant no puede editar datos criticos de empresa, solicitud ni datos financieros; solo puede reemplazar documentos rechazados cuando el flujo lo permita.
- Applicant ve solo eventos publicables de `status-history`; `internal_operator` ve historial completo.
- `internal_operator` puede crear usuarios applicant desde flujo interno; applicant nunca elige rol.
- Matching descarta productos que incumplen requisitos obligatorios y penaliza productos viables con peor ajuste a `validated_need_type`.
- Producto activo que participa en matching debe tener `estimated_annual_rate`; si falta, bloquear activacion o excluirlo del matching con error interno controlado.
- Pruebas automatizadas API: Jest + Supertest. Postman solo puede apoyar pruebas manuales.
