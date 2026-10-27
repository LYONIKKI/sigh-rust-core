use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use crate::models::movimientos_lab::{
    IngresoLabRecord, InsumoSelectorRecord, PersonalAutocompletadoRecord, RegistrarIngresoRequest,
    RegistrarSalidaRequest, SalidaLabRecord,
};
use crate::config::AppState;

#[derive(Deserialize)]
pub struct FiltroFechasParams {
    pub desde: Option<String>,
    pub hasta: Option<String>,
    pub q: Option<String>,
}

#[derive(Deserialize)]
pub struct BuscarParams {
    pub q: Option<String>,
}

/// 1. GET: Bandeja de Salidas con filtro de fechas y buscador
pub async fn listar_salidas(
    State(state): State<AppState>,
    Query(params): Query<FiltroFechasParams>,
) -> Response {
    let desde = params.desde.unwrap_or_else(|| "2020-01-01".to_string());
    let hasta = params.hasta.unwrap_or_else(|| "2099-12-31".to_string());
    let filtro = format!("%{}%", params.q.unwrap_or_default().trim().to_uppercase());

    let query = "
        SELECT 
            m.id,
            TO_CHAR(m.fecha_registro, 'DD/MM/YYYY HH24:MI') AS fecha_hora,
            i.codigo AS insumo_codigo,
            UPPER(i.descripcion) AS insumo_descripcion,
            m.cantidad,
            UPPER(m.personal_nombre) AS personal_nombre,
            COALESCE(m.personal_dni, '---') AS personal_dni,
            UPPER(COALESCE(m.personal_area, '---')) AS personal_area,
            UPPER(COALESCE(m.personal_cargo, '---')) AS personal_cargo,
            UPPER(m.usuario_registro) AS usuario_registro
        FROM public.lab_movimientos m
        JOIN public.lab_insumos i ON m.insumo_id = i.id
        WHERE m.tipo = 'SALIDA' 
          AND m.fecha_registro::DATE BETWEEN $1::DATE AND $2::DATE
          AND (i.codigo ILIKE $3 OR i.descripcion ILIKE $3 OR m.personal_nombre ILIKE $3 OR m.personal_dni ILIKE $3)
        ORDER BY m.id DESC;
    ";

    match sqlx::query_as::<_, SalidaLabRecord>(query)
        .bind(&desde)
        .bind(&hasta)
        .bind(&filtro)
        .fetch_all(&state.db_auth)
        .await
    {
        Ok(data) => (StatusCode::OK, Json(json!({"status": "success", "total": data.len(), "data": data}))).into_response(),
        Err(err) => {
            eprintln!("❌ Error listando salidas: {:?}", err);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al consultar salidas"}))).into_response()
        }
    }
}

/// 2. GET: Bandeja de Ingresos / Remesas con filtro de fechas
pub async fn listar_ingresos(
    State(state): State<AppState>,
    Query(params): Query<FiltroFechasParams>,
) -> Response {
    let desde = params.desde.unwrap_or_else(|| "2020-01-01".to_string());
    let hasta = params.hasta.unwrap_or_else(|| "2099-12-31".to_string());
    let filtro = format!("%{}%", params.q.unwrap_or_default().trim().to_uppercase());

    let query = "
        SELECT 
            m.id,
            TO_CHAR(m.fecha_registro, 'DD/MM/YYYY HH24:MI') AS fecha_registro,
            i.codigo AS insumo_codigo,
            UPPER(i.descripcion) AS insumo_descripcion,
            COALESCE(l.numero_lote, 'HISTÓRICO') AS numero_lote,
            m.cantidad,
            TO_CHAR(l.fecha_vencimiento, 'DD/MM/YYYY') AS fecha_vencimiento,
            UPPER(i.proveedor) AS proveedor,
            UPPER(m.usuario_registro) AS usuario_registro
        FROM public.lab_movimientos m
        JOIN public.lab_insumos i ON m.insumo_id = i.id
        LEFT JOIN public.lab_lotes l ON m.lote_id = l.id
        WHERE m.tipo = 'INGRESO'
          AND m.fecha_registro::DATE BETWEEN $1::DATE AND $2::DATE
          AND (i.codigo ILIKE $3 OR i.descripcion ILIKE $3 OR l.numero_lote ILIKE $3)
        ORDER BY m.id DESC;
    ";

    match sqlx::query_as::<_, IngresoLabRecord>(query)
        .bind(&desde)
        .bind(&hasta)
        .bind(&filtro)
        .fetch_all(&state.db_auth)
        .await
    {
        Ok(data) => (StatusCode::OK, Json(json!({"status": "success", "total": data.len(), "data": data}))).into_response(),
        Err(err) => {
            eprintln!("❌ Error listando ingresos: {:?}", err);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al consultar ingresos"}))).into_response()
        }
    }
}

/// 3. POST: Procesar Salida con descuento FEFO atómico
pub async fn registrar_salida(
    State(state): State<AppState>,
    Json(payload): Json<RegistrarSalidaRequest>,
) -> Response {
    if payload.cantidad <= 0 {
        return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": "La cantidad debe ser mayor a cero"}))).into_response();
    }

    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al iniciar transacción"}))).into_response(),
    };

    let stock_total: i64 = match sqlx::query_scalar(
        "SELECT COALESCE(SUM(stock_actual), 0)::BIGINT FROM public.lab_lotes WHERE insumo_id = $1 AND stock_actual > 0;"
    )
    .bind(payload.insumo_id)
    .fetch_one(&mut *tx)
    .await {
        Ok(s) => s,
        Err(_) => return (StatusCode::NOT_FOUND, Json(json!({"status": "error", "message": "Insumo no encontrado"}))).into_response(),
    };

    if stock_total < payload.cantidad as i64 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error", 
                "message": format!("Stock insuficiente. Disponible: {}, solicitado: {}", stock_total, payload.cantidad)
            })),
        ).into_response();
    }

    // FEFO: Descontar primero del lote que venza antes
    let lotes_disponibles = sqlx::query_as::<_, (i32, i32)>(
        "SELECT id, stock_actual FROM public.lab_lotes 
         WHERE insumo_id = $1 AND stock_actual > 0 
         ORDER BY fecha_vencimiento ASC NULLS LAST, id ASC;"
    )
    .bind(payload.insumo_id)
    .fetch_all(&mut *tx)
    .await
    .unwrap_or_default();

    let mut por_descontar = payload.cantidad;
    for (lote_id, stock_lote) in lotes_disponibles {
        if por_descontar <= 0 { break; }

        let rebajar = por_descontar.min(stock_lote);
        let nuevo_stock = stock_lote - rebajar;

        let _ = sqlx::query("UPDATE public.lab_lotes SET stock_actual = $1 WHERE id = $2;")
            .bind(nuevo_stock)
            .bind(lote_id)
            .execute(&mut *tx)
            .await;

        let _ = sqlx::query(
            "INSERT INTO public.lab_movimientos 
             (insumo_id, lote_id, tipo, cantidad, stock_anterior, stock_posterior, personal_dni, personal_nombre, personal_area, personal_cargo, usuario_registro) 
             VALUES ($1, $2, 'SALIDA', $3, $4, $5, $6, $7, $8, $9, $10);"
        )
        .bind(payload.insumo_id)
        .bind(lote_id)
        .bind(rebajar)
        .bind(stock_lote)
        .bind(nuevo_stock)
        .bind(payload.personal_dni.trim())
        .bind(payload.personal_nombre.trim().to_uppercase())
        .bind(payload.personal_area.trim().to_uppercase())
        .bind(payload.personal_cargo.trim().to_uppercase())
        .bind(payload.usuario_registro.trim().to_uppercase())
        .execute(&mut *tx)
        .await;

        por_descontar -= rebajar;
    }

    if let Err(_) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al confirmar la salida"}))).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({"status": "success", "message": format!("Despacho de {} unidad(es) registrado correctamente.", payload.cantidad)})),
    ).into_response()
}

/// 4. POST: Registrar nuevo ingreso / lote de un insumo existente
pub async fn registrar_ingreso(
    State(state): State<AppState>,
    Json(payload): Json<RegistrarIngresoRequest>,
) -> Response {
    if payload.cantidad <= 0 {
        return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": "La cantidad debe ser mayor a 0"}))).into_response();
    }

    let f_ingreso = payload.fecha_ingreso.trim();
    if let Some(ref f_venc) = payload.fecha_vencimiento {
        let f_venc_limpia = f_venc.trim();
        if !f_venc_limpia.is_empty() && f_ingreso > f_venc_limpia {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"status": "error", "message": "La fecha de vencimiento no puede ser menor a la fecha de ingreso."})),
            ).into_response();
        }
    }

    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error en DB"}))).into_response(),
    };

    let num_lote = payload.numero_lote.trim().to_uppercase();

    let lote_id = match sqlx::query_scalar::<_, i32>(
        "INSERT INTO public.lab_lotes (insumo_id, numero_lote, fecha_ingreso, fecha_vencimiento, stock_actual) 
         VALUES ($1, $2, $3::DATE, NULLIF($4, '')::DATE, $5) RETURNING id;"
    )
    .bind(payload.insumo_id)
    .bind(&num_lote)
    .bind(f_ingreso)
    .bind(&payload.fecha_vencimiento)
    .bind(payload.cantidad)
    .fetch_one(&mut *tx)
    .await {
        Ok(id) => id,
        Err(e) => {
            eprintln!("❌ Error insertando lote: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al registrar el lote"}))).into_response();
        }
    };

    let _ = sqlx::query(
        "INSERT INTO public.lab_movimientos 
         (insumo_id, lote_id, tipo, cantidad, stock_anterior, stock_posterior, usuario_registro) 
         VALUES ($1, $2, 'INGRESO', $3, 0, $3, $4);"
    )
    .bind(payload.insumo_id)
    .bind(lote_id)
    .bind(payload.cantidad)
    .bind(payload.usuario_registro.trim().to_uppercase())
    .execute(&mut *tx)
    .await;

    if let Err(_) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al confirmar ingreso"}))).into_response();
    }

    (
        StatusCode::CREATED,
        Json(json!({"status": "success", "message": format!("Ingreso de {} unidad(es) registrado bajo el lote '{}'.", payload.cantidad, num_lote)})),
    ).into_response()
}

/// 5. GET: Autocompletar personal desde public.lab_personal
pub async fn autocompletar_personal(
    State(state): State<AppState>,
    Query(params): Query<BuscarParams>,
) -> Response {
    let q = params.q.unwrap_or_default().trim().to_uppercase();
    let filtro = format!("%{}%", q);

    let query = "
        SELECT id, dni, nombres, area, cargo, alias 
        FROM public.lab_personal 
        WHERE estado = 1 AND (dni ILIKE $1 OR nombres ILIKE $1 OR alias ILIKE $1)
        LIMIT 10;
    ";

    match sqlx::query_as::<_, PersonalAutocompletadoRecord>(query).bind(filtro).fetch_all(&state.db_auth).await {
        Ok(lista) => (StatusCode::OK, Json(json!({"status": "success", "data": lista}))).into_response(),
        Err(err) => {
            eprintln!("❌ Error autocompletando personal: {:?}", err);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error de consulta"}))).into_response()
        }
    }
}

/// 6. GET: Selector de reactivos para llenar selects de los modales
pub async fn selector_insumos_activos(State(state): State<AppState>) -> Response {
    let query = "
        SELECT 
            i.id,
            i.codigo,
            UPPER(i.descripcion) AS descripcion,
            COALESCE(SUM(l.stock_actual), 0)::BIGINT AS stock_disponible
        FROM public.lab_insumos i
        LEFT JOIN public.lab_lotes l ON i.id = l.insumo_id AND l.stock_actual > 0
        WHERE i.estado = 1
        GROUP BY i.id, i.codigo, i.descripcion
        ORDER BY i.descripcion ASC;
    ";

    match sqlx::query_as::<_, InsumoSelectorRecord>(query).fetch_all(&state.db_auth).await {
        Ok(lista) => (StatusCode::OK, Json(json!({"status": "success", "data": lista}))).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al cargar reactivos"}))).into_response(),
    }
}

/// 7. DELETE: Anular salida y retornar stock al lote
pub async fn anular_salida(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> Response {
    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(_) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al iniciar transacción"})),
        ).into_response(),
    };

    // Obtener los datos del movimiento de salida
    let mov = match sqlx::query_as::<_, (i32, Option<i32>, i32)>(
        "SELECT insumo_id, lote_id, cantidad FROM public.lab_movimientos WHERE id = $1 AND tipo = 'SALIDA';"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await {
        Ok(Some(m)) => m,
        _ => return (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "Movimiento de salida no encontrado"})),
        ).into_response(),
    };

    let (_insumo_id, lote_id_opt, cantidad) = mov;

    // Restaurar el stock en el lote de procedencia
    if let Some(lote_id) = lote_id_opt {
        let _ = sqlx::query("UPDATE public.lab_lotes SET stock_actual = stock_actual + $1 WHERE id = $2;")
            .bind(cantidad)
            .bind(lote_id)
            .execute(&mut *tx)
            .await;
    }

    // Eliminar el registro del movimiento de salida
    let _ = sqlx::query("DELETE FROM public.lab_movimientos WHERE id = $1;").bind(id).execute(&mut *tx).await;

    if let Err(_) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al confirmar reversión de stock"})),
        ).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success", 
            "message": format!("Salida anulada. Se han reintegrado {} unidad(es) al stock.", cantidad)
        })),
    ).into_response()
}

use crate::models::movimientos_lab::EditarSalidaRequest;

/// 8. PUT: Actualizar personal y/o ajustar cantidad de la salida
pub async fn actualizar_salida(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
    Json(payload): Json<EditarSalidaRequest>,
) -> Response {
    if payload.cantidad_nueva <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "La cantidad debe ser mayor a 0"})),
        ).into_response();
    }

    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(_) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al iniciar transacción"})),
        ).into_response(),
    };

    let mov = match sqlx::query_as::<_, (i32, Option<i32>, i32)>(
        "SELECT insumo_id, lote_id, cantidad FROM public.lab_movimientos WHERE id = $1 AND tipo = 'SALIDA';"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await {
        Ok(Some(m)) => m,
        _ => return (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "Salida no encontrada"})),
        ).into_response(),
    };

    let (_insumo_id, lote_id_opt, cantidad_anterior) = mov;
    let diferencia = payload.cantidad_nueva - cantidad_anterior; // Si es positivo se sacó más; si es negativo se devuelve stock

    if let Some(lote_id) = lote_id_opt {
        if diferencia > 0 {
            // Verificar si el lote tiene stock suficiente para el incremento
            let stock_lote: i32 = sqlx::query_scalar("SELECT stock_actual FROM public.lab_lotes WHERE id = $1;")
                .bind(lote_id)
                .fetch_one(&mut *tx)
                .await
                .unwrap_or(0);

            if stock_lote < diferencia {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"status": "error", "message": format!("Stock insuficiente para incrementar salida. Disponible en lote: {}", stock_lote)})),
                ).into_response();
            }
        }

        // Ajustar el stock en el lote
        let _ = sqlx::query("UPDATE public.lab_lotes SET stock_actual = stock_actual - $1 WHERE id = $2;")
            .bind(diferencia)
            .bind(lote_id)
            .execute(&mut *tx)
            .await;
    }

    // Actualizar registro de salida
    let query_upd = "
        UPDATE public.lab_movimientos 
        SET cantidad = $1, personal_dni = $2, personal_nombre = $3, personal_area = $4, personal_cargo = $5
        WHERE id = $6;
    ";

    let _ = sqlx::query(query_upd)
        .bind(payload.cantidad_nueva)
        .bind(payload.personal_dni.trim())
        .bind(payload.personal_nombre.trim().to_uppercase())
        .bind(payload.personal_area.trim().to_uppercase())
        .bind(payload.personal_cargo.trim().to_uppercase())
        .bind(id)
        .execute(&mut *tx)
        .await;

    if let Err(_) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al confirmar actualización"})),
        ).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({"status": "success", "message": "Salida actualizada correctamente."})),
    ).into_response()
}