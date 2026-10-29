use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct FiltroHistorialParams {
    pub desde: Option<String>,
    pub hasta: Option<String>,
    pub q: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FuaHistorialRecord {
    pub id_cuenta_atencion: i32,
    pub paciente_nombre: Option<String>,
    pub nro_historia_clinica: Option<String>,
    pub fua_numero_original: Option<String>,
    pub fua_farmacia: Option<String>,
    pub fua_laboratorio: Option<String>,
    pub fua_imagenes: Option<String>,
    pub usuario_registro: String,
    pub fecha_registro: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DetalleRastreoFuaRecord {
    pub id_cuenta_atencion: i32,
    pub documento_numero: Option<String>,
    pub nro_historia_clinica: Option<String>,
    pub paciente_nombre: Option<String>,
    pub fnacimiento: Option<String>,
    pub fua_medico: Option<String>,
    pub cita_servicio_jamo: Option<String>,
    pub cita_fecha: Option<String>,
    pub fua_numero_original: Option<String>,
    pub fua_farmacia: Option<String>,
    pub fua_laboratorio: Option<String>,
    pub fua_imagenes: Option<String>,
    pub usuario_registro: String,
    pub fecha_registro: String,
    pub tipo_fua_coincidente: String,
}