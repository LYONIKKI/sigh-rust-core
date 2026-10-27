use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct PersonalLabRecord {
    pub id: i32,
    pub dni: String,
    pub nombres: String,
    pub area: String,
    pub cargo: String,
    pub alias: Option<String>,
    pub estado: i16,
    pub creado_en: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct GuardarPersonalRequest {
    pub dni: String,
    pub nombres: String,
    pub area: String,
    pub cargo: String,
    pub alias: Option<String>,
}