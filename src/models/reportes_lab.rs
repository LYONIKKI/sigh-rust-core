use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Filtros para reportes de fechas y áreas
#[derive(Deserialize, Debug)]
pub struct ReporteFiltrosParams {
    pub desde: Option<String>,
    pub hasta: Option<String>,
    #[allow(dead_code)]
    pub area: Option<String>,
    pub insumo_id: Option<i32>,
}
/// 1. Kárdex detallado por reactivo
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct MovimientoKardexRecord {
    pub id: i64,
    pub fecha_hora: String,
    pub tipo: String, // 'INGRESO' o 'SALIDA'
    pub tipo_despacho: String, // 'EMPAQUE_COMPLETO', 'FRACCION_DET', 'UNIDAD'
    pub numero_lote: String,
    pub cantidad: i32,
    pub determinaciones_movidas: i32,
    pub stock_anterior: i32,
    pub stock_posterior: i32,
    pub receptor: String,
    pub receptor_area: String,
    pub despachador: String,
}

/// 2. Resumen de consumo agrupado por Área
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct ConsumoPorAreaRecord {
    pub area: String,
    pub total_despachos: i64,
    pub total_empaques: i64,
    pub total_determinaciones: i64,
}

/// 3. Resumen de inventario valorizado y alertas de vencimiento
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct InventarioValorizadoRecord {
    pub id: i32,
    pub codigo: String,
    pub descripcion: String,
    pub presentacion: String,
    pub ubicacion: String,
    pub es_fraccionable: bool,
    pub det_por_empaque: i32,
    pub empaques_sellados: i64,
    pub determinaciones_abiertas: i64,
    pub stock_total_fisico: i64,
    pub valor_unitario: f64,
    pub valor_total_estimado: f64,
    pub proximo_vencimiento: Option<String>,
    pub dias_para_vencer: Option<i32>,
    pub estado_alerta: String, // 'VENCIDO', 'CRITICO', 'PROXIMO', 'OPTIMO'
}