export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "user" | "cliente";

export type OrderState = "pendiente" | "en_preparacion" | "entregado" | "cancelado";

export type BatchState =
  | "disponible"
  | "reservado_parcial"
  | "reservado_total"
  | "agotado"
  | "vencido"
  | "ajustado";

export type MovementType =
  | "ingreso"
  | "reserva"
  | "liberacion_reserva"
  | "egreso_entrega"
  | "ajuste_admin"
  | "correccion"
  | "descarte"
  | "produccion_directa_entrega"
  | "transferencia_salida"
  | "transferencia_entrada"
  | "vaciado_deposito"
  | "correccion_composicion";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string;
          display_name: string | null;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id: string;
          email?: string;
          username: string;
          display_name?: string | null;
          role?: UserRole;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      app_settings: {
        Row: {
          id: number;
          app_name: string;
          currency: string;
          dias_duracion_meta_por_defecto: number;
          kg_guardado_por_1kg_meta: number;
          permitir_entrega_sin_stock: boolean;
          precio_base_por_kilo: number | null;
          alerta_meta_dias_normal_hasta: number;
          alerta_meta_dias_warning_hasta: number;
          alerta_meta_dias_vencido_desde: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Record<string, never>;
        Update: Partial<Omit<Database["public"]["Tables"]["app_settings"]["Row"], "id">>;
      };
      storage_location_types: {
        Row: {
          id: string;
          nombre: string;
          slug: string;
          es_sistema: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          nombre: string;
          slug: string;
          es_sistema?: boolean;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["storage_location_types"]["Insert"]>;
      };
      storage_locations: {
        Row: {
          id: string;
          nombre: string;
          tipo_id: string;
          dueno: string | null;
          grupo_zona: string | null;
          descripcion: string | null;
          capacidad_guardado_kg: number;
          capacidad_meta_kilos: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          nombre: string;
          tipo_id: string;
          dueno?: string | null;
          grupo_zona?: string | null;
          descripcion?: string | null;
          capacidad_guardado_kg: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["storage_locations"]["Insert"]>;
      };
      stock_batches: {
        Row: {
          id: string;
          deposito_id: string;
          cantidad_meta_kilos: number;
          equivalente_guardado_kg: number;
          cantidad_reservada_meta_kilos: number;
          cantidad_disponible_meta_kilos: number;
          fecha_guardado: string;
          guardado_por_usuario_id: string | null;
          fecha_vencimiento_estimada: string | null;
          observaciones: string | null;
          estado: BatchState;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          deposito_id: string;
          cantidad_meta_kilos: number;
          cantidad_reservada_meta_kilos?: number;
          fecha_guardado?: string;
          guardado_por_usuario_id?: string | null;
          fecha_vencimiento_estimada?: string | null;
          observaciones?: string | null;
          estado?: BatchState;
          is_active?: boolean;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["stock_batches"]["Insert"]>;
      };
      stock_movements: {
        Row: {
          id: string;
          tipo_movimiento: MovementType;
          lote_id: string | null;
          deposito_id: string | null;
          pedido_id: string | null;
          cantidad_meta_kilos: number;
          equivalente_guardado_kg: number;
          usuario_id: string;
          notas: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          tipo_movimiento: MovementType;
          lote_id?: string | null;
          deposito_id?: string | null;
          pedido_id?: string | null;
          cantidad_meta_kilos: number;
          usuario_id: string;
          notas?: string | null;
          metadata?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["stock_movements"]["Insert"]>;
      };
      orders: {
        Row: {
          id: string;
          cliente_nombre: string;
          cantidad_meta_kilos: number;
          kilos_entregados_acumulado: number;
          fecha_pedido: string;
          fecha_encargo: string | null;
          creado_por_usuario_id: string;
          estado: OrderState;
          notas: string | null;
          prioridad: number | null;
          is_active: boolean;
          precio_sugerido_por_kilo: number | null;
          total_sugerido: number | null;
          cobrado_pre_entrega_at: string | null;
          cobrado_recibio_dinero_usuario_id: string | null;
          cobrado_monto: number | null;
          origen_pedido: "admin" | "portal_clientes";
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          cliente_nombre: string;
          cantidad_meta_kilos: number;
          kilos_entregados_acumulado?: number;
          fecha_pedido?: string;
          fecha_encargo?: string | null;
          creado_por_usuario_id: string;
          estado?: OrderState;
          notas?: string | null;
          prioridad?: number | null;
          is_active?: boolean;
          precio_sugerido_por_kilo?: number | null;
          total_sugerido?: number | null;
          cobrado_pre_entrega_at?: string | null;
          cobrado_recibio_dinero_usuario_id?: string | null;
          cobrado_monto?: number | null;
          origen_pedido?: "admin" | "portal_clientes";
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
      };
      order_reservations: {
        Row: {
          id: string;
          order_id: string;
          stock_batch_id: string;
          deposito_id: string;
          cantidad_meta_kilos: number;
          created_at: string;
          created_by: string;
        };
        Insert: {
          order_id: string;
          stock_batch_id: string;
          deposito_id: string;
          cantidad_meta_kilos: number;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_reservations"]["Insert"]>;
      };
      order_deliveries: {
        Row: {
          id: string;
          order_id: string;
          entregado_at: string;
          dinero_recibido: number;
          recibio_dinero_usuario_id: string;
          recibio_dinero_nombre: string;
          produccion_directa_meta_kilos: number;
          notas: string | null;
          es_correccion: boolean;
          motivo_correccion: string | null;
          created_at: string;
          created_by: string;
        };
        Insert: {
          order_id: string;
          entregado_at?: string;
          dinero_recibido: number;
          recibio_dinero_usuario_id: string;
          recibio_dinero_nombre?: string;
          produccion_directa_meta_kilos?: number;
          notas?: string | null;
          es_correccion?: boolean;
          motivo_correccion?: string | null;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_deliveries"]["Insert"]>;
      };
      order_delivery_items: {
        Row: {
          id: string;
          delivery_id: string;
          stock_batch_id: string | null;
          deposito_id: string | null;
          cantidad_meta_kilos: number;
          origen_tipo: "stock" | "produccion_directa";
          notas: string | null;
        };
        Insert: {
          delivery_id: string;
          stock_batch_id?: string | null;
          deposito_id?: string | null;
          cantidad_meta_kilos: number;
          origen_tipo: "stock" | "produccion_directa";
          notas?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_delivery_items"]["Insert"]>;
      };
      pricing_rules: {
        Row: {
          id: string;
          nombre: string;
          cantidad_minima_kilos: number;
          precio_por_kilo: number;
          prioridad: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          nombre: string;
          cantidad_minima_kilos: number;
          precio_por_kilo: number;
          prioridad?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_rules"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string | null;
          accion: string;
          usuario_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          metadata: Json | null;
          motivo: string | null;
          created_at: string;
        };
        Insert: {
          entity_type: string;
          entity_id?: string | null;
          accion: string;
          usuario_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          metadata?: Json | null;
          motivo?: string | null;
        };
        Update: never;
      };
      storage_groups: {
        Row: {
          id: string;
          nombre: string;
          descripcion: string | null;
          activo: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          nombre: string;
          descripcion?: string | null;
          activo?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["storage_groups"]["Insert"]>;
      };
      storage_group_members: {
        Row: {
          id: string;
          group_id: string;
          storage_location_id: string;
          orden: number | null;
          created_at: string;
        };
        Insert: {
          group_id: string;
          storage_location_id: string;
          orden?: number | null;
        };
        Update: Partial<Pick<Database["public"]["Tables"]["storage_group_members"]["Insert"], "orden">>;
      };
    };
    Views: {
      v_global_stock_summary: {
        Row: {
          total_meta_kilos: number;
          total_reservado_kilos: number;
          total_libre_kilos: number;
        };
      };
      v_pending_orders_gap: {
        Row: {
          order_id: string;
          pedido_kilos: number;
          reservado_kilos: number;
          falta_producir_kilos: number;
        };
      };
      v_pedidos_kpis: {
        Row: {
          total_pedidos_abiertos_kg: number;
          pedidos_abiertos_count: number;
          total_stock_disponible_kg: number;
          faltante_preparar_kg: number;
          tiradas_faltantes: number | null;
        };
      };
      v_open_orders_cobertura: {
        Row: {
          order_id: string;
          cum_kg: number;
          alcanza_fifo: boolean;
        };
      };
      v_storage_group_metrics: {
        Row: {
          group_id: string;
          nombre: string;
          descripcion: string | null;
          activo: boolean;
          capacidad_guardado_total: number;
          capacidad_meta_total: number;
          stock_total: number;
          stock_reservado: number;
          stock_libre: number;
          porcentaje_ocupacion: number;
        };
      };
      v_history_events: {
        Row: {
          event_id: string;
          source: string;
          created_at: string;
          entity_type: string;
          entity_id: string | null;
          event_kind: string;
          usuario_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          metadata: Json | null;
          motivo: string | null;
          search_text: string;
        };
      };
    };
    Functions: {
      register_stock_intake: {
        Args: {
          p_deposito_id: string;
          p_cantidad_meta_kilos: number;
          p_fecha_guardado: string;
          p_observaciones: string | null;
          p_metadata?: Json | null;
        };
        Returns: string;
      };
      recommend_storage_groups_for_meta: {
        Args: {
          p_cantidad_meta_kilos: number;
        };
        Returns: {
          group_id: string;
          nombre: string;
          descripcion: string | null;
          activo: boolean;
          capacidad_guardado_total: number;
          capacidad_meta_total: number;
          stock_total: number;
          stock_reservado: number;
          stock_libre: number;
          porcentaje_ocupacion: number;
        }[];
      };
      transfer_stock_batch: {
        Args: {
          p_source_batch_id: string;
          p_dest_deposito_id: string;
          p_cantidad_meta_kilos: number;
          p_notas: string | null;
        };
        Returns: string;
      };
      adjust_stock_batch_quantity: {
        Args: {
          p_batch_id: string;
          p_nueva_cantidad_meta_kilos: number;
          p_motivo: string | null;
          p_notas: string | null;
        };
        Returns: null;
      };
      empty_storage_location_stock: {
        Args: {
          p_deposito_id: string;
          p_motivo: string;
        };
        Returns: number;
      };
      extract_stock_from_deposit: {
        Args: {
          p_deposito_id: string;
          p_cantidad_meta_kilos: number;
          p_motivo: string;
        };
        Returns: number;
      };
      update_batch_composition: {
        Args: {
          p_batch_id: string;
          p_packs_de_3: number;
          p_bolsas_individuales: number;
          p_motivo: string | null;
          p_notas: string | null;
        };
        Returns: null;
      };
      create_order: {
        Args: {
          p_cliente_nombre: string;
          p_cantidad_meta_kilos: number;
          p_fecha_pedido: string;
          p_fecha_encargo: string | null;
          p_notas: string | null;
          p_origen_pedido?: "admin" | "portal_clientes";
        };
        Returns: string;
      };
      reserve_from_batches: {
        Args: {
          p_order_id: string;
          p_items: Json;
        };
        Returns: null;
      };
      release_reservations_for_order: {
        Args: { p_order_id: string };
        Returns: null;
      };
      suggest_reservations_for_order: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      deliver_order: {
        Args: {
          p_order_id: string;
          p_payload: Json;
        };
        Returns: string;
      };
      cancel_order: {
        Args: {
          p_order_id: string;
          p_reason: string | null;
        };
        Returns: null;
      };
      set_order_kilos_entregados_acumulado: {
        Args: {
          p_order_id: string;
          p_kilos: number;
        };
        Returns: null;
      };
      mark_order_cobrado_pre_entrega: {
        Args: {
          p_order_id: string;
          p_recibio_dinero_usuario_id: string;
          p_monto: number;
        };
        Returns: null;
      };
      admin_system_snapshot: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
  };
}
