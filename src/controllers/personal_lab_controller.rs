use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use crate::models::personal_lab::{GuardarPersonalRequest, PersonalLabRecord};
use crate::config::AppState;

/// 1. GET: Listar todo el personal activo
pub async fn listar_personal(State(state): State<AppState>) -> Response {
    let query = "
        SELECT 
            id,
            dni,
            UPPER(nombres) AS nombres,
            UPPER(area) AS area,
            UPPER(cargo) AS cargo,
            UPPER(COALESCE(alias, '---')) AS alias,
            estado,
            TO_CHAR(creado_en AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI') AS creado_en
        FROM public.lab_personal
        WHERE estado = 1
        ORDER BY nombres ASC;
    ";

    match sqlx::query_as::<_, PersonalLabRecord>(query)
        .fetch_all(&state.db_auth)
        .await
    {
        Ok(items) => (
            StatusCode::OK,
            Json(json!({"status": "success", "total": items.len(), "data": items})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error listando personal: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al consultar personal"})),
            ).into_response()
        }
    }
}

/// 2. GET: Obtener un personal por ID para ver detalle
pub async fn obtener_personal_por_id(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Response {
    let query = "
        SELECT 
            id,
            dni,
            UPPER(nombres) AS nombres,
            UPPER(area) AS area,
            UPPER(cargo) AS cargo,
            UPPER(COALESCE(alias, '---')) AS alias,
            estado,
            TO_CHAR(creado_en AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI') AS creado_en
        FROM public.lab_personal
        WHERE id = $1;
    ";

    match sqlx::query_as::<_, PersonalLabRecord>(query)
        .bind(id)
        .fetch_optional(&state.db_auth)
        .await
    {
        Ok(Some(item)) => (StatusCode::OK, Json(json!({"status": "success", "data": item}))).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"status": "error", "message": "No encontrado"}))).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error de base de datos"}))).into_response(),
    }
}

/// 3. POST: Crear nuevo personal
pub async fn crear_personal(
    State(state): State<AppState>,
    Json(payload): Json<GuardarPersonalRequest>,
) -> Response {
    let dni = payload.dni.trim();
    let nombres = payload.nombres.trim().to_uppercase();
    let area = payload.area.trim().to_uppercase();
    let cargo = payload.cargo.trim().to_uppercase();
    let alias = payload.alias.map(|a| a.trim().to_uppercase());

    if dni.is_empty() || nombres.is_empty() || area.is_empty() || cargo.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "DNI, Nombres, Área y Cargo son obligatorios"})),
        ).into_response();
    }

    let query = "
        INSERT INTO public.lab_personal (dni, nombres, area, cargo, alias, estado, creado_en)
        VALUES ($1, $2, $3, $4, $5, 1, NOW() AT TIME ZONE 'America/Lima')
        RETURNING id;
    ";

    match sqlx::query_scalar::<_, i32>(query)
        .bind(dni)
        .bind(&nombres)
        .bind(&area)
        .bind(&cargo)
        .bind(&alias)
        .fetch_one(&state.db_auth)
        .await
    {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!({"status": "success", "message": "Personal registrado con éxito", "id": id})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error insertando personal: {:?}", err);
            (
                StatusCode::CONFLICT,
                Json(json!({"status": "error", "message": "El DNI ingresado ya existe en la base de datos"})),
            ).into_response()
        }
    }
}

/// 4. PUT: Actualizar personal existente
pub async fn actualizar_personal(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(payload): Json<GuardarPersonalRequest>,
) -> Response {
    let dni = payload.dni.trim();
    let nombres = payload.nombres.trim().to_uppercase();
    let area = payload.area.trim().to_uppercase();
    let cargo = payload.cargo.trim().to_uppercase();
    let alias = payload.alias.map(|a| a.trim().to_uppercase());

    let query = "
        UPDATE public.lab_personal
        SET dni = $1, nombres = $2, area = $3, cargo = $4, alias = $5
        WHERE id = $6;
    ";

    match sqlx::query(query)
        .bind(dni)
        .bind(&nombres)
        .bind(&area)
        .bind(&cargo)
        .bind(&alias)
        .bind(id)
        .execute(&state.db_auth)
        .await
    {
        Ok(res) if res.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({"status": "success", "message": "Personal actualizado correctamente"})),
        ).into_response(),
        _ => (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "Personal no encontrado"})),
        ).into_response(),
    }
}

/// 5. DELETE: Borrado lógico para proteger historial de despachos
pub async fn eliminar_personal(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Response {
    let query = "UPDATE public.lab_personal SET estado = 0 WHERE id = $1;";

    match sqlx::query(query).bind(id).execute(&state.db_auth).await {
        Ok(res) if res.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({"status": "success", "message": "Personal retirado del catálogo activo"})),
        ).into_response(),
        _ => (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "Registro no encontrado"})),
        ).into_response(),
    }
}