use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use crate::config::AppState;
use crate::models::reportes_lab::{
    ConsumoPorAreaRecord, InventarioValorizadoRecord, MovimientoKardexRecord, ReporteFiltrosParams,
};

/// 1. GET: Kárdex cronológico (individual o global de todos los movimientos)
pub async fn obtener_kardex_insumo(
    State(state): State<AppState>,
    Query(params): Query<ReporteFiltrosParams>,
) -> Response {
    let desde = params.desde.unwrap_or_else(|| "2020-01-01".to_string());
    let hasta = params.hasta.unwrap_or_else(|| "2099-12-31".to_string());
    let insumo_id = params.insumo_id.unwrap_or(0);

    let query = "
        SELECT 
            m.id,
            TO_CHAR(m.fecha_registro, 'DD/MM/YYYY HH24:MI:SS') AS fecha_hora,
            m.tipo,
            COALESCE(m.tipo_despacho, 'UNIDAD') AS tipo_despacho,
            COALESCE(l.numero_lote, 'HISTÓRICO') AS numero_lote,
            m.cantidad,
            COALESCE(m.determinaciones_movidas, 0) AS determinaciones_movidas,
            m.stock_anterior,
            m.stock_posterior,
            COALESCE(m.personal_nombre, '---') AS receptor,
            COALESCE(m.personal_area, '---') AS receptor_area,
            m.usuario_registro AS despachador
        FROM public.lab_movimientos m
        LEFT JOIN public.lab_lotes l ON m.lote_id = l.id
        WHERE ($1 = 0 OR m.insumo_id = $1)
          AND m.fecha_registro::DATE BETWEEN $2::DATE AND $3::DATE
        ORDER BY m.id ASC;
    ";

    match sqlx::query_as::<_, MovimientoKardexRecord>(query)
        .bind(insumo_id)
        .bind(&desde)
        .bind(&hasta)
        .fetch_all(&state.db_auth)
        .await
    {
        Ok(data) => (
            StatusCode::OK,
            Json(json!({"status": "success", "total": data.len(), "data": data})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error obteniendo kárdex: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al consultar el kárdex"})),
            ).into_response()
        }
    }
}

/// 2. GET: Consumo consolidado agrupado por área de destino
pub async fn reporte_consumo_por_area(
    State(state): State<AppState>,
    Query(params): Query<ReporteFiltrosParams>,
) -> Response {
    let desde = params.desde.unwrap_or_else(|| "2020-01-01".to_string());
    let hasta = params.hasta.unwrap_or_else(|| "2099-12-31".to_string());

    let query = "
        SELECT 
            COALESCE(NULLIF(UPPER(m.personal_area), ''), 'SIN ÁREA ESPECIFICADA') AS area,
            COUNT(m.id)::BIGINT AS total_despachos,
            COALESCE(SUM(CASE WHEN m.tipo_despacho = 'EMPAQUE_COMPLETO' THEN m.cantidad ELSE 0 END), 0)::BIGINT AS total_empaques,
            COALESCE(SUM(CASE WHEN m.tipo_despacho = 'FRACCION_DET' THEN m.cantidad ELSE 0 END), 0)::BIGINT AS total_determinaciones
        FROM public.lab_movimientos m
        WHERE m.tipo = 'SALIDA'
          AND m.fecha_registro::DATE BETWEEN $1::DATE AND $2::DATE
        GROUP BY COALESCE(NULLIF(UPPER(m.personal_area), ''), 'SIN ÁREA ESPECIFICADA')
        ORDER BY total_despachos DESC;
    ";

    match sqlx::query_as::<_, ConsumoPorAreaRecord>(query)
        .bind(&desde)
        .bind(&hasta)
        .fetch_all(&state.db_auth)
        .await
    {
        Ok(data) => (
            StatusCode::OK,
            Json(json!({"status": "success", "total": data.len(), "data": data})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error reporte por área: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al procesar consolidado por área"})),
            ).into_response()
        }
    }
}

/// 3. GET: Inventario valorizado con semáforo preventivo de vencimiento
pub async fn reporte_inventario_valorizado(
    State(state): State<AppState>,
) -> Response {
    let query = "
        SELECT 
            i.id,
            i.codigo,
            UPPER(i.descripcion) AS descripcion,
            UPPER(COALESCE(i.presentacion, 'UNIDAD')) AS presentacion,
            UPPER(i.ubicacion) AS ubicacion,
            COALESCE(i.es_fraccionable, FALSE) AS es_fraccionable,
            COALESCE(i.determinaciones_por_empaque, 1) AS det_por_empaque,
            COALESCE(SUM(l.empaques_enteros), 0)::BIGINT AS empaques_sellados,
            COALESCE(SUM(l.determinaciones_abiertas), 0)::BIGINT AS determinaciones_abiertas,
            COALESCE(SUM(l.stock_actual), 0)::BIGINT AS stock_total_fisico,
            i.valor_unitario::FLOAT8 AS valor_unitario,
            (COALESCE(SUM(l.stock_actual), 0) * i.valor_unitario)::FLOAT8 AS valor_total_estimado,
            TO_CHAR(MIN(l.fecha_vencimiento), 'YYYY-MM-DD') AS proximo_vencimiento,
            (MIN(l.fecha_vencimiento) - CURRENT_DATE)::INT AS dias_para_vencer,
            CASE 
                WHEN MIN(l.fecha_vencimiento) < CURRENT_DATE THEN 'VENCIDO'
                WHEN (MIN(l.fecha_vencimiento) - CURRENT_DATE) <= 30 THEN 'CRITICO'
                WHEN (MIN(l.fecha_vencimiento) - CURRENT_DATE) <= 90 THEN 'PROXIMO'
                ELSE 'OPTIMO'
            END AS estado_alerta
        FROM public.lab_insumos i
        LEFT JOIN public.lab_lotes l ON i.id = l.insumo_id AND l.stock_actual > 0
        WHERE i.estado = 1
        GROUP BY i.id, i.codigo, i.descripcion, i.presentacion, i.ubicacion, 
                 i.es_fraccionable, i.determinaciones_por_empaque, i.valor_unitario
        ORDER BY i.descripcion ASC;
    ";

    match sqlx::query_as::<_, InventarioValorizadoRecord>(query)
        .fetch_all(&state.db_auth)
        .await
    {
        Ok(data) => (
            StatusCode::OK,
            Json(json!({"status": "success", "total": data.len(), "data": data})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error reporte valorizado: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al consultar inventario valorizado"})),
            ).into_response()
        }
    }
}