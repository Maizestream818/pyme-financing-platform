# Fase 05: Productos y Reglas

## Objetivo

Implementar catalogo de productos financieros simulados y reglas de compatibilidad.

## Archivos que Puede Modificar

- `apps/api/src/modules/financial-products/**`
- `apps/api/src/modules/product-rules/**`
- Pruebas relacionadas.
- Seeds de productos y reglas si faltan o requieren ajuste documentado.

## Archivos que No Debe Modificar

- `Documentacion/**`
- Modulos de riesgo, matching y decisiones.
- Modulos de documentos salvo dependencias estrictas.

## Tareas Especificas

- Implementar CRUD controlado de productos.
- Responder con formato oficial `data/meta/error`; no usar `success`.
- Implementar `is_active` para desactivacion.
- Bloquear activacion de productos que participen en matching sin `estimated_annual_rate`.
- Validar `min_amount`, `max_amount`, antiguedad y tasa.
- Implementar CRUD controlado de reglas.
- Validar `rule_field`, `operator`, `condition_value`, `condition_value_to` y `score_weight`.
- Bloquear applicant.
- No borrar productos ni reglas con historial.

## Criterios de Aceptacion

- Operador crea, edita y desactiva productos.
- Operador crea, edita y desactiva reglas.
- Applicant no accede.
- `score_weight` queda entre -100 y 100.
- `between` exige `condition_value_to`.
- Productos inactivos no deben usarse en matches futuros.
- Producto activo de matching debe tener `estimated_annual_rate`.
- Las respuestas siguen `data/meta/error`.

## Pruebas o Comandos de Verificacion

- Crear producto valido.
- Rechazar rango invalido.
- Desactivar producto.
- Crear regla valida.
- Rechazar regla incoherente.
- Bloquear applicant.

## Resultado Esperado

Catalogos listos para evaluacion de matching.

## Que Debe Reportar Codex

- Endpoints implementados.
- Validaciones implementadas.
- Pruebas ejecutadas.
- Cambios de seed si existen.
