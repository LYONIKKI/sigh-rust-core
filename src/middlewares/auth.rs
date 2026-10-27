// src/middlewares/auth.rs
use axum::{
    extract::Request,
    middleware::Next,
    response::{IntoResponse, Response},
    http::StatusCode,
    Json,
};
use serde_json::json;

/// Middleware para validar Telesalud
pub async fn verificar_rol_telesalud(
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    let rol = req.headers()
        .get("X-User-Role")
        .and_then(|val| val.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if rol == "admin_rust" || rol == "telesalud_rust" || rol == "admin" || rol == "administrador" {
        Ok(next.run(req).await)
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "status": "error",
                "message": "Acceso denegado: No cuenta con permisos para operar en Telesalud."
            })),
        ).into_response())
    }
}

/// Middleware para validar Administrador
pub async fn verificar_rol_admin(
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    let rol = req.headers()
        .get("X-User-Role")
        .and_then(|val| val.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if rol == "admin_rust" || rol == "admin" || rol == "administrador" {
        Ok(next.run(req).await)
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "status": "error",
                "message": "Acceso restringido: Se requieren permisos de Administrador del Sistema."
            })),
        ).into_response())
    }
}

/// Middleware para validar Laboratorio
pub async fn verificar_rol_lab(
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    let rol = req.headers()
        .get("X-User-Role")
        .and_then(|val| val.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if rol == "admin_rust" || rol == "lab_rust" || rol == "admin" || rol == "administrador" {
        Ok(next.run(req).await)
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "status": "error",
                "message": "Acceso denegado: Su rol no cuenta con permisos para operar en Insumos de Laboratorio."
            })),
        ).into_response())
    }
}