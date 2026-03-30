# Decisiones de modelado y supuestos

## Unidades: meta vs guardado

- `capacidad_guardado_kg`: dato persistido por depósito.
- `capacidad_meta_kilos`: **columna generada** `capacidad_guardado_kg / (app_settings.kg_guardado_por_1kg_meta)` con default 120 en settings (replicado en CHECK por si la fila settings no existe aún en seeds).

En la práctica el factor vive en `app_settings`; la columna generada en `storage_locations` usa el valor por defecto **120** en la fórmula SQL inicial. Si cambia el factor global, una migración futura puede sustituir la generated column por trigger o vista materializada. **MVP**: factor 120 fijo en definición de columna; la UI lee también `app_settings` para mostrar la misma regla.

> **Supuesto**: Para simplificar el MVP, `capacidad_meta_kilos` en BD es `capacidad_guardado_kg / 120` alineado con el seed. Si el admin cambia `kg_guardado_por_1kg_meta`, la UI recalcula visualmente; persistir recálculo masivo es mejora posterior.

## Duración y vencimiento de lotes

- `fecha_vencimiento_estimada` en `stock_batches`: `fecha_guardado + (dias_duracion_meta_por_defecto desde settings al momento del alta)` copiada en insert (o trigger). Umbrales de alerta (0–4, 5–6, 7+) configurables en `app_settings` como `alerta_meta_dias_normal_hasta`, etc.

## Entrega manual y producción directa

- Cabecera `order_deliveries`: importe cobrado, quién recibió el dinero, fecha entrega.
- Detalle `order_delivery_items`: cada línea con `origen_tipo` = `stock` | `produccion_directa`; si es stock, `stock_batch_id` / `deposito_id` obligatorios según tipo.
- **Permitir entrega sin stock**: flag `app_settings.permitir_entrega_sin_stock`; si true, se permite `produccion_directa` que cubra el faltante.

## Reservas y disponible

- `stock_batches.cantidad_disponible_meta_kilos`: columna generada `(cantidad_meta_kilos - cantidad_reservada_meta_kilos)` con check >= 0.

## Soft delete

- `is_active` boolean en perfiles, depósitos, tipos personalizados, reglas de precio. Tipos de sistema `es_sistema = true` no se borran, solo custom se desactivan.

## Pedidos entregados editables solo por admin

- RLS: `UPDATE` en `orders` con `estado = 'entregado'` solo si `is_admin()`.

## Auditoría

- Tabla `audit_logs` genérica: JSON `old_values` / `new_values` / `metadata`.
- Triggers `AFTER INSERT/UPDATE/DELETE` en tablas clave para capturar cambios (MVP: inserts manuales desde app para acciones complejas + triggers en updates críticos).
