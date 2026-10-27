// src/controllers/usuario_controller.rs
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use crate::models::usuario::{ActualizarUsuarioRequest, CrearUsuarioRequest, UsuarioRecord};
use crate::config::AppState;

/// 1. GET: Listar usuarios con slug_destino = 'SIGH_RUST'
pub async fn listar_usuarios_sigh(State(state): State<AppState>) -> Response {
    let query = "
        SELECT id, nombre, usuario, rol, estado, slug_destino 
        FROM usuarios_sigh 
        WHERE slug_destino = 'SIGH_RUST' 
        ORDER BY id ASC;
    ";

    match sqlx::query_as::<_, UsuarioRecord>(query).fetch_all(&state.db_auth).await {
        Ok(usuarios) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "total": usuarios.len(),
                "data": usuarios
            })),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error listando usuarios en PostgreSQL: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al consultar los usuarios en PostgreSQL"})),
            ).into_response()
        }
    }
}

/// 2. POST: Registrar nuevo usuario en PostgreSQL
pub async fn crear_usuario_sigh(
    State(state): State<AppState>,
    Json(payload): Json<CrearUsuarioRequest>,
) -> Response {
    let nombre = payload.nombre.trim().to_uppercase();
    let usuario = payload.usuario.trim().to_lowercase();
    let pass = payload.password.trim();
    let rol = payload.rol.trim().to_lowercase();

    if nombre.is_empty() || usuario.is_empty() || pass.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "Nombre, usuario y contraseña son obligatorios."})),
        ).into_response();
    }

    if rol != "admin_rust" && rol != "telesalud_rust" && rol != "lab_rust" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "Rol inválido. Elija: admin_rust, telesalud_rust o lab_rust."})),
        ).into_response();
    }

    // Corregido: 'usuarios_sigh' sin 'dbo.'
    let insert_query = "
        INSERT INTO usuarios_sigh (nombre, usuario, password, rol, estado, slug_destino) 
        VALUES ($1, $2, $3, $4, 1, 'SIGH_RUST') 
        RETURNING id;
    ";

    match sqlx::query_scalar::<_, i32>(insert_query)
        .bind(&nombre)
        .bind(&usuario)
        .bind(pass)
        .bind(&rol)
        .fetch_one(&state.db_auth)
        .await
    {
        Ok(new_id) => (
            StatusCode::CREATED,
            Json(json!({
                "status": "success",
                "message": format!("Usuario '{}' creado exitosamente.", usuario),
                "id": new_id
            })),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error insertando usuario en PostgreSQL: {:?}", err);
            let msg = format!("{:?}", err);
            if msg.contains("unique") || msg.contains("duplicate") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({"status": "error", "message": "El nombre de usuario ya está registrado en el sistema."})),
                ).into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error interno al crear el usuario en PostgreSQL."})),
                ).into_response()
            }
        }
    }
}

/// 3. PUT: Actualizar usuario existente
pub async fn actualizar_usuario_sigh(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(payload): Json<ActualizarUsuarioRequest>,
) -> Response {
    let nombre = payload.nombre.trim().to_uppercase();
    let usuario = payload.usuario.trim().to_lowercase();
    let rol = payload.rol.trim().to_lowercase();
    let estado = payload.estado;

    if nombre.is_empty() || usuario.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "El nombre y usuario no pueden estar vacíos."})),
        ).into_response();
    }

    let result = if let Some(pass) = payload.password.filter(|p| !p.trim().is_empty()) {
        sqlx::query(
            "UPDATE usuarios_sigh 
             SET nombre = $1, usuario = $2, password = $3, rol = $4, estado = $5 
             WHERE id = $6 AND slug_destino = 'SIGH_RUST';"
        )
        .bind(&nombre)
        .bind(&usuario)
        .bind(pass.trim())
        .bind(&rol)
        .bind(estado)
        .bind(id)
        .execute(&state.db_auth)
        .await
    } else {
        sqlx::query(
            "UPDATE usuarios_sigh 
             SET nombre = $1, usuario = $2, rol = $3, estado = $4 
             WHERE id = $5 AND slug_destino = 'SIGH_RUST';"
        )
        .bind(&nombre)
        .bind(&usuario)
        .bind(&rol)
        .bind(estado)
        .bind(id)
        .execute(&state.db_auth)
        .await
    };

    match result {
        Ok(res) if res.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("Usuario #{} actualizado exitosamente.", id)
            })),
        ).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "Usuario no encontrado en este módulo."})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error actualizando usuario: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al actualizar los datos en PostgreSQL."})),
            ).into_response()
        }
    }
}

/// 4. DELETE: Eliminar usuario
pub async fn eliminar_usuario_sigh(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Response {
    if id == 58 {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"status": "error", "message": "No se puede eliminar el usuario Administrador base."})),
        ).into_response();
    }

    let delete_query = "DELETE FROM usuarios_sigh WHERE id = $1 AND slug_destino = 'SIGH_RUST';";
    match sqlx::query(delete_query).bind(id).execute(&state.db_auth).await {
        Ok(res) if res.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("Usuario #{} eliminado exitosamente.", id)
            })),
        ).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "El usuario no existe o no pertenece a este módulo."})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error eliminando usuario en PostgreSQL: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al eliminar usuario en la base de datos."})),
            ).into_response()
        }
    }
}