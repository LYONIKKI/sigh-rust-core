use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Registro para la tabla de inventario con semáforo y consolidado
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct InsumoInventarioRecord {
    pub id: i32,
    pub codigo: String,
    pub descripcion: String,
    pub stock_total: i64,
    pub ubicacion: String,
    pub valor_unitario: f64,
    pub proveedor: Option<String>,
    pub estado_insumo: String,
    pub fecha_ingreso_reciente: Option<String>,
    pub fecha_vencimiento_proxima: Option<String>,
    pub stock_minimo: i32,
}

/// Request para crear un nuevo insumo maestro (+ lote inicial opcional)
#[derive(Deserialize, Debug)]
pub struct CrearInsumoRequest {
    pub codigo: String,
    pub descripcion: String,
    pub ubicacion: String,
    pub valor_unitario: f64,
    pub proveedor: Option<String>,
    pub stock_inicial: i32,
    pub fecha_ingreso: String,
    pub fecha_vencimiento: Option<String>,
    pub stock_minimo: Option<i32>,
    pub alias_registro: Option<String>, // <-- Usuario que registra
    pub usuario_registro: String,
}

/// Request para actualizar los datos maestros del insumo
#[derive(Deserialize, Debug)]
pub struct ActualizarInsumoRequest {
    pub descripcion: String,
    pub ubicacion: String,
    pub valor_unitario: f64,
    pub proveedor: Option<String>,
    pub stock_minimo: i32,
    pub estado_insumo: String,
}