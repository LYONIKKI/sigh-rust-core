use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use crate::models::inventario_lab::{ActualizarInsumoRequest, CrearInsumoRequest, InsumoInventarioRecord};
use crate::config::AppState;

/// 1. GET: Listar todo el catálogo con cálculo de stock consolidado y semáforos
pub async fn listar_inventario(State(state): State<AppState>) -> Response {
    let query = "
        SELECT 
            i.id,
            i.codigo,
            UPPER(i.descripcion) AS descripcion,
            COALESCE(SUM(l.stock_actual), 0)::BIGINT AS stock_total,
            UPPER(i.ubicacion) AS ubicacion,
            i.valor_unitario::FLOAT8 AS valor_unitario,
            UPPER(i.proveedor) AS proveedor,
            i.estado_insumo,
            TO_CHAR(MAX(l.fecha_ingreso), 'DD/MM/YYYY') AS fecha_ingreso_reciente,
            TO_CHAR(MIN(l.fecha_vencimiento), 'DD/MM/YYYY') AS fecha_vencimiento_proxima,
            i.stock_minimo
        FROM public.lab_insumos i
        LEFT JOIN public.lab_lotes l ON i.id = l.insumo_id AND l.stock_actual > 0
        WHERE i.estado = 1
        GROUP BY i.id, i.codigo, i.descripcion, i.ubicacion, i.valor_unitario, i.proveedor, i.estado_insumo, i.stock_minimo
        ORDER BY i.descripcion ASC;
    ";

    match sqlx::query_as::<_, InsumoInventarioRecord>(query).fetch_all(&state.db_auth).await {
        Ok(items) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "total": items.len(),
                "data": items
            })),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error consultando inventario: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al consultar inventario"})),
            ).into_response()
        }
    }
}

/// 2. POST: Registrar insumo maestro con lote y kárdex inicial
pub async fn registrar_insumo(
    State(state): State<AppState>,
    Json(payload): Json<CrearInsumoRequest>,
) -> Response {
    let codigo = payload.codigo.trim().to_uppercase();
    let descripcion = payload.descripcion.trim().to_uppercase();
    let ubicacion = payload.ubicacion.trim().to_uppercase();
    let proveedor = payload.proveedor.map(|p| p.trim().to_uppercase());
    let stock_inicial = payload.stock_inicial.max(0);
    let stock_minimo = payload.stock_minimo.unwrap_or(2);
    let f_ingreso = payload.fecha_ingreso.trim();

    // 1. Validación de coherencia de fechas en backend
    if let Some(ref f_venc) = payload.fecha_vencimiento {
        let f_venc_limpia = f_venc.trim();
        if !f_venc_limpia.is_empty() && f_ingreso > f_venc_limpia {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "error",
                    "message": "La fecha de vencimiento no puede ser menor a la fecha de ingreso."
                })),
            ).into_response();
        }
    }

    // 2. Determinar el usuario que registra para llenar alias_registro
    let usuario_firmante = payload
        .alias_registro
        .as_deref()
        .unwrap_or(&payload.usuario_registro)
        .trim()
        .to_uppercase();

    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(err) => {
            eprintln!("❌ Error iniciando transacción: {:?}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al iniciar transacción en la base de datos"})),
            ).into_response();
        }
    };

    // 3. Inserción del Insumo Maestro (guardando el usuario en alias_registro)
    let insumo_id = match sqlx::query_scalar::<_, i32>(
        "INSERT INTO public.lab_insumos 
         (codigo, descripcion, ubicacion, valor_unitario, proveedor, stock_minimo, alias_registro) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;"
    )
    .bind(&codigo)
    .bind(&descripcion)
    .bind(&ubicacion)
    .bind(payload.valor_unitario)
    .bind(&proveedor)
    .bind(stock_minimo)
    .bind(&usuario_firmante)
    .fetch_one(&mut *tx)
    .await {
        Ok(id) => id,
        Err(err) => {
            eprintln!("❌ Error insertando insumo: {:?}", err);
            let _ = tx.rollback().await;
            return (
                StatusCode::CONFLICT,
                Json(json!({"status": "error", "message": "El código de insumo ya está registrado"})),
            ).into_response();
        }
    };

    // 4. Si tiene stock inicial, registrar Lote y Movimiento en el Kárdex
    if stock_inicial > 0 {
        let num_lote = format!("HIST-{}", f_ingreso.replace("-", ""));

        let lote_id = match sqlx::query_scalar::<_, i32>(
            "INSERT INTO public.lab_lotes (insumo_id, numero_lote, fecha_ingreso, fecha_vencimiento, stock_actual) 
             VALUES ($1, $2, $3::DATE, NULLIF($4, '')::DATE, $5) RETURNING id;"
        )
        .bind(insumo_id)
        .bind(&num_lote)
        .bind(f_ingreso)
        .bind(&payload.fecha_vencimiento)
        .bind(stock_inicial)
        .fetch_one(&mut *tx)
        .await {
            Ok(id) => id,
            Err(e) => {
                eprintln!("❌ Error en lote inicial: {:?}", e);
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error al registrar el lote inicial"})),
                ).into_response();
            }
        };

        let res_mov = sqlx::query(
            "INSERT INTO public.lab_movimientos 
             (insumo_id, lote_id, tipo, cantidad, stock_anterior, stock_posterior, usuario_registro) 
             VALUES ($1, $2, 'INGRESO', $3, 0, $3, $4);"
        )
        .bind(insumo_id)
        .bind(lote_id)
        .bind(stock_inicial)
        .bind(&usuario_firmante)
        .execute(&mut *tx)
        .await;

        if let Err(e) = res_mov {
            eprintln!("❌ Error registrando movimiento inicial: {:?}", e);
            let _ = tx.rollback().await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al registrar el kárdex inicial"})),
            ).into_response();
        }
    }

    // 5. Confirmar transacción
    if let Err(err) = tx.commit().await {
        eprintln!("❌ Error en commit: {:?}", err);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "No se pudo confirmar la transacción"})),
        ).into_response();
    }

    (
        StatusCode::CREATED,
        Json(json!({
            "status": "success",
            "message": format!("Insumo '{}' guardado correctamente por {}.", descripcion, usuario_firmante)
        })),
    ).into_response()
}

/// 3. PUT: Actualizar datos de un insumo existente
pub async fn actualizar_insumo(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(payload): Json<ActualizarInsumoRequest>,
) -> Response {
    let descripcion = payload.descripcion.trim().to_uppercase();
    let ubicacion = payload.ubicacion.trim().to_uppercase();
    let proveedor = payload.proveedor.map(|p| p.trim().to_uppercase());
    let estado_insumo = payload.estado_insumo.trim().to_uppercase();

    let query = "
        UPDATE public.lab_insumos 
        SET descripcion = $1, ubicacion = $2, valor_unitario = $3, proveedor = $4, stock_minimo = $5, estado_insumo = $6
        WHERE id = $7 AND estado = 1;
    ";

    match sqlx::query(query)
        .bind(&descripcion)
        .bind(&ubicacion)
        .bind(payload.valor_unitario)
        .bind(&proveedor)
        .bind(payload.stock_minimo)
        .bind(&estado_insumo)
        .bind(id)
        .execute(&state.db_auth)
        .await
    {
        Ok(res) if res.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({"status": "success", "message": "Insumo actualizado exitosamente."})),
        ).into_response(),
        _ => (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "Insumo no encontrado."})),
        ).into_response(),
    }
}

/// 4. DELETE: Borrado total en cascada atómica (movimientos/salidas -> lotes -> insumo)
pub async fn eliminar_insumo(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Response {
    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("❌ Error al iniciar transacción: {:?}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al iniciar transacción"})),
            ).into_response();
        }
    };

    // 1. Eliminar TODOS los movimientos del insumo (tanto INGRESOS como SALIDAS)
    if let Err(e) = sqlx::query("DELETE FROM public.lab_movimientos WHERE insumo_id = $1;")
        .bind(id)
        .execute(&mut *tx)
        .await
    {
        eprintln!("❌ Error eliminando movimientos: {:?}", e);
        let _ = tx.rollback().await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al eliminar movimientos del insumo"})),
        ).into_response();
    }

    // 2. Eliminar TODOS los lotes asociados al insumo
    if let Err(e) = sqlx::query("DELETE FROM public.lab_lotes WHERE insumo_id = $1;")
        .bind(id)
        .execute(&mut *tx)
        .await
    {
        eprintln!("❌ Error eliminando lotes: {:?}", e);
        let _ = tx.rollback().await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al eliminar lotes del insumo"})),
        ).into_response();
    }

    // 3. Eliminar el insumo maestro
    let res_insumo = sqlx::query("DELETE FROM public.lab_insumos WHERE id = $1;")
        .bind(id)
        .execute(&mut *tx)
        .await;

    match res_insumo {
        Ok(res) if res.rows_affected() > 0 => {
            if let Err(e) = tx.commit().await {
                eprintln!("❌ Error en commit: {:?}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error al confirmar eliminación"})),
                ).into_response();
            }

            (
                StatusCode::OK,
                Json(json!({
                    "status": "success",
                    "message": "Insumo, lotes y todo su historial de ingresos y salidas fueron eliminados completamente."
                })),
            ).into_response()
        }
        _ => {
            let _ = tx.rollback().await;
            (
                StatusCode::NOT_FOUND,
                Json(json!({"status": "error", "message": "Insumo no encontrado."})),
            ).into_response()
        }
    }
}