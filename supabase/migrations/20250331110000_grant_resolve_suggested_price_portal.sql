-- Permite al portal (clientes autenticados) previsualizar precio sugerido antes de crear el pedido.
-- La función es STABLE, solo lectura de lógica por tramos; mismo criterio que create_order.
GRANT EXECUTE ON FUNCTION public.resolve_suggested_price_per_kg(numeric) TO authenticated;
