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
            UPPER(COALESCE(i.presentacion, 'UNIDAD')) AS presentacion,
            COALESCE(i.es_fraccionable, FALSE) AS es_fraccionable,
            COALESCE(i.determinaciones_por_empaque, 1) AS determinaciones_por_empaque,
            COALESCE(SUM(l.stock_actual), 0)::BIGINT AS stock_total,
            UPPER(i.ubicacion) AS ubicacion,
            i.valor_unitario::FLOAT8 AS valor_unitario,
            UPPER(i.proveedor) AS proveedor,
            i.estado_insumo,
            (SELECT l2.numero_lote FROM public.lab_lotes l2 WHERE l2.insumo_id = i.id ORDER BY l2.id DESC LIMIT 1) AS numero_lote_activo,
            TO_CHAR(MAX(l.fecha_ingreso), 'YYYY-MM-DD') AS fecha_ingreso_reciente,
            TO_CHAR(MIN(l.fecha_vencimiento), 'YYYY-MM-DD') AS fecha_vencimiento_proxima,
            i.stock_minimo
        FROM public.lab_insumos i
        LEFT JOIN public.lab_lotes l ON i.id = l.insumo_id AND l.stock_actual > 0
        WHERE i.estado = 1
        GROUP BY i.id, i.codigo, i.descripcion, i.presentacion, i.es_fraccionable, 
                i.determinaciones_por_empaque, i.ubicacion, i.valor_unitario, 
                i.proveedor, i.estado_insumo, i.stock_minimo
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

/// 2. POST: Registrar insumo maestro con lote manual y stock sincronizado
pub async fn registrar_insumo(
    State(state): State<AppState>,
    Json(payload): Json<CrearInsumoRequest>,
) -> Response {
    let codigo = payload.codigo.trim().to_uppercase();
    let descripcion = payload.descripcion.trim().to_uppercase();
    let presentacion = payload.presentacion.unwrap_or_else(|| "UNIDAD".to_string()).trim().to_uppercase();
    let es_fraccionable = payload.es_fraccionable.unwrap_or(false);
    let det_por_empaque = payload.determinaciones_por_empaque.unwrap_or(1).max(1);
    let ubicacion = payload.ubicacion.trim().to_uppercase();
    let proveedor = payload.proveedor.map(|p| p.trim().to_uppercase());
    let stock_empaques = payload.stock_inicial.max(0);
    let stock_minimo = payload.stock_minimo.unwrap_or(2);
    let f_ingreso = payload.fecha_ingreso.trim();

    let lote_manual = payload.numero_lote
        .map(|l| l.trim().to_uppercase())
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| "LOTE-INICIAL".to_string());

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

    let insumo_id = match sqlx::query_scalar::<_, i32>(
        "INSERT INTO public.lab_insumos 
         (codigo, descripcion, presentacion, es_fraccionable, determinaciones_por_empaque, 
          ubicacion, valor_unitario, proveedor, stock_minimo, alias_registro) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id;"
    )
    .bind(&codigo)
    .bind(&descripcion)
    .bind(&presentacion)
    .bind(es_fraccionable)
    .bind(det_por_empaque)
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

    if stock_empaques > 0 {
        let lote_id = match sqlx::query_scalar::<_, i32>(
            "INSERT INTO public.lab_lotes 
             (insumo_id, numero_lote, fecha_ingreso, fecha_vencimiento, stock_actual, empaques_enteros, determinaciones_abiertas) 
             VALUES ($1, $2, $3::DATE, NULLIF($4, '')::DATE, $5, $5, 0) RETURNING id;"
        )
        .bind(insumo_id)
        .bind(&lote_manual)
        .bind(f_ingreso)
        .bind(&payload.fecha_vencimiento)
        .bind(stock_empaques)
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
             (insumo_id, lote_id, tipo, cantidad, stock_anterior, stock_posterior, usuario_registro, tipo_despacho, determinaciones_movidas) 
             VALUES ($1, $2, 'INGRESO', $3, 0, $3, $4, 'EMPAQUE_COMPLETO', 0);"
        )
        .bind(insumo_id)
        .bind(lote_id)
        .bind(stock_empaques)
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
    let presentacion = payload.presentacion.unwrap_or_else(|| "UNIDAD".to_string()).trim().to_uppercase();
    let es_fraccionable = payload.es_fraccionable.unwrap_or(false);
    let det_por_empaque = payload.determinaciones_por_empaque.unwrap_or(1).max(1);
    let ubicacion = payload.ubicacion.trim().to_uppercase();
    let proveedor = payload.proveedor.map(|p| p.trim().to_uppercase());
    let estado_insumo = payload.estado_insumo.trim().to_uppercase();

    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(err) => {
            eprintln!("❌ Error iniciando transacción: {:?}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al conectar con la base de datos"})),
            ).into_response();
        }
    };

    let query_insumo = "
        UPDATE public.lab_insumos 
        SET descripcion = $1, presentacion = $2, es_fraccionable = $3, 
            determinaciones_por_empaque = $4, ubicacion = $5, valor_unitario = $6, 
            proveedor = $7, stock_minimo = $8, estado_insumo = $9
        WHERE id = $10 AND estado = 1;
    ";

    let res_insumo = sqlx::query(query_insumo)
        .bind(&descripcion)
        .bind(&presentacion)
        .bind(es_fraccionable)
        .bind(det_por_empaque)
        .bind(&ubicacion)
        .bind(payload.valor_unitario)
        .bind(&proveedor)
        .bind(payload.stock_minimo)
        .bind(&estado_insumo)
        .bind(id)
        .execute(&mut *tx)
        .await;

    match res_insumo {
        Ok(res) if res.rows_affected() > 0 => {},
        _ => {
            let _ = tx.rollback().await;
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"status": "error", "message": "Insumo no encontrado."})),
            ).into_response();
        }
    };

    if let Some(ref lote) = payload.numero_lote {
        let lote_limpio = lote.trim().to_uppercase();
        if !lote_limpio.is_empty() {
            let query_lote = "
                UPDATE public.lab_lotes 
                SET numero_lote = $1, 
                    fecha_ingreso = COALESCE(NULLIF($2, '')::DATE, fecha_ingreso), 
                    fecha_vencimiento = NULLIF($3, '')::DATE 
                WHERE id = (
                    SELECT id FROM public.lab_lotes 
                    WHERE insumo_id = $4 
                    ORDER BY id DESC LIMIT 1
                );
            ";

            if let Err(e) = sqlx::query(query_lote)
                .bind(&lote_limpio)
                .bind(&payload.fecha_ingreso)
                .bind(&payload.fecha_vencimiento)
                .bind(id)
                .execute(&mut *tx)
                .await
            {
                eprintln!("❌ Error actualizando lote asociado: {:?}", e);
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error al actualizar los datos del lote"})),
                ).into_response();
            }
        }
    }

    if let Err(err) = tx.commit().await {
        eprintln!("❌ Error en commit: {:?}", err);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "No se pudo confirmar la actualización"})),
        ).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({"status": "success", "message": "Insumo y lote actualizados exitosamente."})),
    ).into_response()
}

/// 4. DELETE: Borrado total en cascada atómica
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
                    "message": "Insumo y sus registros eliminados completamente."
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