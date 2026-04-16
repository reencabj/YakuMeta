-- =============================================================================
-- Quitar notificación Discord vía trigger (Vault + pg_net).
-- El alta de pedido notifica desde la app: orderService → v_pedidos_kpis → invoke.
-- Así no depende de secretos en Vault ni del worker pg_net (suele fallar en silencio).
-- Portal: reutilizar notifyDiscordNuevoPedidoFromKpi() tras create_order o volver a
-- configurar Vault y reactivar un trigger similar.
-- =============================================================================

DROP TRIGGER IF EXISTS orders_notify_discord_after_insert ON public.orders;
DROP FUNCTION IF EXISTS public.trg_orders_notify_discord_new_order();
