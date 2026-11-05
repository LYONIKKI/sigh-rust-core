use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct InsumoInventarioRecord {
    pub id: i32,
    pub codigo: String,
    pub descripcion: String,
    pub presentacion: String,
    pub es_fraccionable: bool,
    pub determinaciones_por_empaque: i32,
    pub stock_total: i64,
    pub ubicacion: String,
    pub valor_unitario: f64,
    pub proveedor: Option<String>,
    pub estado_insumo: String,
    pub numero_lote_activo: Option<String>,
    pub fecha_ingreso_reciente: Option<String>,
    pub fecha_vencimiento_proxima: Option<String>,
    pub stock_minimo: i32,
}

#[derive(Deserialize, Debug)]
pub struct CrearInsumoRequest {
    pub codigo: String,
    pub descripcion: String,
    pub presentacion: Option<String>,
    pub es_fraccionable: Option<bool>,
    pub determinaciones_por_empaque: Option<i32>,
    pub ubicacion: String,
    pub valor_unitario: f64,
    pub proveedor: Option<String>,
    pub stock_inicial: i32,
    pub numero_lote: Option<String>,
    pub fecha_ingreso: String,
    pub fecha_vencimiento: Option<String>,
    pub stock_minimo: Option<i32>,
    pub alias_registro: Option<String>,
    pub usuario_registro: String,
}

#[derive(Deserialize, Debug)]
pub struct ActualizarInsumoRequest {
    pub descripcion: String,
    pub presentacion: Option<String>,
    pub es_fraccionable: Option<bool>,
    pub determinaciones_por_empaque: Option<i32>,
    pub ubicacion: String,
    pub valor_unitario: f64,
    pub proveedor: Option<String>,
    pub stock_minimo: i32,
    pub estado_insumo: String,
    pub numero_lote: Option<String>,
    pub fecha_ingreso: Option<String>,
    pub fecha_vencimiento: Option<String>,
}