// src/models/usuario.rs
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct UsuarioRecord {
    pub id: i32,
    pub nombre: String,
    pub usuario: String,
    pub rol: String,
    pub estado: i32,
    pub slug_destino: String,
}

#[derive(Deserialize, Debug)]
pub struct CrearUsuarioRequest {
    pub nombre: String,
    pub usuario: String,
    pub password: String,
    pub rol: String,
}

#[derive(Deserialize, Debug)]
pub struct ActualizarUsuarioRequest {
    pub nombre: String,
    pub usuario: String,
    pub password: Option<String>, // Si viene vacío, no se actualiza la contraseña
    pub rol: String,
    pub estado: i32,
}