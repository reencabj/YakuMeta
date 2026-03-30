# Esquema relacional (resumen)

```
auth.users
    │
    └── profiles (1:1) ── created_by/updated_by ──┐
                                                  │
storage_location_types ◄── storage_locations      │
         │                         │              │
         │                         ├── stock_batches
         │                         │       │
         │                         │       ├── stock_movements
         │                         │       │
orders ◄─┴── order_reservations ────┘       │
   │              │                        │
   ├── order_deliveries                    │
   │        └── order_delivery_items       │
   │                                       │
   └───────────────────────────────────────┘

pricing_rules (independiente)
app_settings (fila única id=1)
audit_logs (genérico)
```

Relaciones clave:

- `orders` 1—N `order_reservations` (lotes concretos).
- `orders` 1—N `order_deliveries`; cada entrega N `order_delivery_items` (stock o producción directa).
- `stock_batches` pertenece a un `storage_locations`; movimientos referencian opcionalmente lote, depósito y pedido.
