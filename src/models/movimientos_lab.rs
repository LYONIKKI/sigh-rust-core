use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Registro para la tabla de Historial de Salidas / Despachos
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct SalidaLabRecord {
    pub id: i64,
    pub fecha_hora: String,
    pub insumo_codigo: String,
    pub insumo_descripcion: String,
    pub cantidad: i32,
    pub personal_nombre: String,
    pub personal_dni: String,
    pub personal_area: String,
    pub personal_cargo: String,
    pub usuario_registro: String,
}

/// Registro para la tabla de Historial de Ingresos / Remesas
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct IngresoLabRecord {
    pub id: i64,
    pub fecha_registro: String,
    pub insumo_codigo: String,
    pub insumo_descripcion: String,
    pub numero_lote: String,
    pub cantidad: i32,
    pub fecha_vencimiento: Option<String>,
    pub proveedor: Option<String>,
    pub usuario_registro: String,
}

/// Request para procesar un nuevo despacho físico a personal
#[derive(Deserialize, Debug)]
pub struct RegistrarSalidaRequest {
    pub insumo_id: i32,
    pub cantidad: i32,
    #[allow(dead_code)]
    pub personal_id: i32,
    pub personal_dni: String,
    pub personal_nombre: String,
    pub personal_area: String,
    pub personal_cargo: String,
    pub usuario_registro: String,
}

/// Request para ingresar un nuevo lote o remesa de stock
#[derive(Deserialize, Debug)]
pub struct RegistrarIngresoRequest {
    pub insumo_id: i32,
    pub numero_lote: String,
    pub fecha_ingreso: String,             // YYYY-MM-DD
    pub fecha_vencimiento: Option<String>, // YYYY-MM-DD
    pub cantidad: i32,
    #[allow(dead_code)]
    pub proveedor: Option<String>,
    pub usuario_registro: String,
}

/// DTO para el autocompletado en milisegundos del personal receptor
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct PersonalAutocompletadoRecord {
    pub id: i32,
    pub dni: String,
    pub nombres: String,
    pub area: String,
    pub cargo: String,
    pub alias: Option<String>,
}

/// DTO para el selector de insumos activos
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct InsumoSelectorRecord {
    pub id: i32,
    pub codigo: String,
    pub descripcion: String,
    pub stock_disponible: i64,
}

/// Request para editar datos o rectificar la cantidad de una salida
#[derive(Deserialize, Debug)]
pub struct EditarSalidaRequest {
    pub cantidad_nueva: i32,
    pub personal_dni: String,
    pub personal_nombre: String,
    pub personal_area: String,
    pub personal_cargo: String,
    #[allow(dead_code)]
    pub usuario_registro: String,
}