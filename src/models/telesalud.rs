use serde::{Deserialize, Serialize};

// DTO para enviar la información al frontend en la consulta GET por ID
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TelesaludFuaRecord {
    pub id_cuenta_atencion: i32,
    pub fua_numero_original: Option<String>,
    pub documento_numero: Option<String>,
    pub nro_historia_clinica: Option<String>,
    pub paciente_nombre: Option<String>,
    pub fnacimiento: Option<String>,
    pub fua_medico: Option<String>,
    pub cita_servicio_jamo: Option<String>,
    pub cita_fecha: Option<String>,
    pub fua_numero_editado: Option<String>,
}

// DTO para recibir el payload POST al guardar
#[derive(Deserialize, Debug)]
pub struct GuardarFuaRequest {
    pub id_cuenta_atencion: i32,
    pub fua_numero_original: Option<String>,
    pub documento_numero: Option<String>,
    pub nro_historia_clinica: Option<String>,
    pub paciente_nombre: Option<String>,
    pub fnacimiento: Option<String>,
    pub fua_medico: Option<String>,
    pub cita_servicio_jamo: Option<String>,
    pub cita_fecha: Option<String>,
    pub fua_numero_editado: String,
    pub usuario_registro: String,
}

// DTO para la tabla de atenciones del día
#[derive(Serialize, Deserialize, Debug)]
pub struct TelesaludHoyRecord {
    pub id_cuenta_atencion: i32,
    pub fua_numero_original: Option<String>,
    pub fua_numero_editado: String,
    pub documento_numero: Option<String>,
    pub nro_historia_clinica: Option<String>,
    pub paciente_nombre: Option<String>,
    pub fua_medico: Option<String>,
    pub cita_servicio_jamo: Option<String>,
    pub hora_registro: String,
    pub usuario_registro: String,
}