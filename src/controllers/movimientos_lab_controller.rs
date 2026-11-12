use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use crate::models::movimientos_lab::{
    EditarSalidaRequest, IngresoLabRecord, InsumoSelectorRecord, PersonalAutocompletadoRecord,
    RegistrarIngresoRequest, RegistrarSalidaRequest, SalidaLabRecord,
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

/// 1. GET: Bandeja de Salidas
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
            COALESCE(m.tipo_despacho, 'UNIDAD') AS tipo_despacho,
            COALESCE(m.determinaciones_movidas, 0) AS determinaciones_movidas,
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
            eprintln!("❌ Error SQL en listar_salidas: {:?}", err);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": format!("Error SQL: {:?}", err)}))).into_response()
        }
    }
}

/// 2. GET: Bandeja de Ingresos
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

/// 3. POST: Procesar Salida con lógica de fraccionamiento FEFO
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

    let insumo_info: Option<(bool, i32)> = sqlx::query_as(
        "SELECT es_fraccionable, COALESCE(determinaciones_por_empaque, 1) FROM public.lab_insumos WHERE id = $1;"
    )
    .bind(payload.insumo_id)
    .fetch_optional(&mut *tx)
    .await
    .unwrap_or(None);

    let (es_fraccionable, factor_det) = match insumo_info {
        Some(info) => info,
        None => return (StatusCode::NOT_FOUND, Json(json!({"status": "error", "message": "Insumo no encontrado"}))).into_response(),
    };

    let tipo_despacho = payload.tipo_despacho.unwrap_or_else(|| {
        if es_fraccionable { "FRACCION_DET".to_string() } else { "UNIDAD".to_string() }
    });

    let lotes = sqlx::query_as::<_, (i32, i32, i32, i32)>(
        "SELECT id, stock_actual, COALESCE(empaques_enteros, 0), COALESCE(determinaciones_abiertas, 0)
         FROM public.lab_lotes 
         WHERE insumo_id = $1 AND stock_actual > 0 
         ORDER BY fecha_vencimiento ASC NULLS LAST, id ASC;"
    )
    .bind(payload.insumo_id)
    .fetch_all(&mut *tx)
    .await
    .unwrap_or_default();

    if lotes.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": "No hay stock disponible para este reactivo"}))).into_response();
    }

    if es_fraccionable && tipo_despacho == "FRACCION_DET" {
        let mut det_por_descontar = payload.cantidad;

        let total_det_disponible: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM((COALESCE(empaques_enteros, 0) * $2) + COALESCE(determinaciones_abiertas, stock_actual)), 0)::BIGINT 
             FROM public.lab_lotes WHERE insumo_id = $1 AND stock_actual > 0;"
        )
        .bind(payload.insumo_id)
        .bind(factor_det)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(0);

        if (det_por_descontar as i64) > total_det_disponible {
            return (StatusCode::BAD_REQUEST, Json(json!({
                "status": "error",
                "message": format!("Determinaciones insuficientes. Disponibles: {}, solicitadas: {}", total_det_disponible, det_por_descontar)
            }))).into_response();
        }

        for (lote_id, mut stock_actual, mut empaques, mut abiertas) in lotes {
            if det_por_descontar <= 0 { break; }

            if empaques == 0 && abiertas == 0 && stock_actual > 0 {
                empaques = stock_actual;
            }

            while det_por_descontar > 0 && (abiertas > 0 || empaques > 0) {
                if abiertas == 0 && empaques > 0 {
                    empaques -= 1;
                    abiertas = factor_det;
                }

                let restar = det_por_descontar.min(abiertas);
                abiertas -= restar;
                det_por_descontar -= restar;
            }

            stock_actual = empaques + (if abiertas > 0 { 1 } else { 0 });

            let _ = sqlx::query(
                "UPDATE public.lab_lotes 
                 SET stock_actual = $1, empaques_enteros = $2, determinaciones_abiertas = $3 
                 WHERE id = $4;"
            )
            .bind(stock_actual)
            .bind(empaques)
            .bind(abiertas)
            .bind(lote_id)
            .execute(&mut *tx)
            .await;

            let _ = sqlx::query(
                "INSERT INTO public.lab_movimientos 
                 (insumo_id, lote_id, tipo, cantidad, stock_anterior, stock_posterior, 
                  personal_dni, personal_nombre, personal_area, personal_cargo, usuario_registro, tipo_despacho, determinaciones_movidas) 
                 VALUES ($1, $2, 'SALIDA', $3, $4, $5, $6, $7, $8, $9, $10, 'FRACCION_DET', $11);"
            )
            .bind(payload.insumo_id)
            .bind(lote_id)
            .bind(payload.cantidad)
            .bind(stock_actual + 1)
            .bind(stock_actual)
            .bind(payload.personal_dni.trim())
            .bind(payload.personal_nombre.trim().to_uppercase())
            .bind(payload.personal_area.trim().to_uppercase())
            .bind(payload.personal_cargo.trim().to_uppercase())
            .bind(payload.usuario_registro.trim().to_uppercase())
            .bind(payload.cantidad)
            .execute(&mut *tx)
            .await;
        }
    } else {
        let mut cant_por_descontar = payload.cantidad;
        let stock_total_empaques: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(COALESCE(empaques_enteros, stock_actual)), 0)::BIGINT FROM public.lab_lotes WHERE insumo_id = $1 AND stock_actual > 0;"
        )
        .bind(payload.insumo_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(0);

        if (cant_por_descontar as i64) > stock_total_empaques {
            return (StatusCode::BAD_REQUEST, Json(json!({
                "status": "error",
                "message": format!("Stock insuficiente. Disponible: {}, solicitado: {}", stock_total_empaques, cant_por_descontar)
            }))).into_response();
        }

        for (lote_id, stock_lote, mut empaques, abiertas) in lotes {
            if cant_por_descontar <= 0 { break; }

            if empaques == 0 && abiertas == 0 {
                empaques = stock_lote;
            }

            let restar = cant_por_descontar.min(empaques);
            empaques -= restar;
            let nuevo_stock = empaques + (if abiertas > 0 { 1 } else { 0 });

            let _ = sqlx::query(
                "UPDATE public.lab_lotes 
                 SET stock_actual = $1, empaques_enteros = $2 
                 WHERE id = $3;"
            )
            .bind(nuevo_stock)
            .bind(empaques)
            .bind(lote_id)
            .execute(&mut *tx)
            .await;

            let _ = sqlx::query(
                "INSERT INTO public.lab_movimientos 
                 (insumo_id, lote_id, tipo, cantidad, stock_anterior, stock_posterior, 
                  personal_dni, personal_nombre, personal_area, personal_cargo, usuario_registro, tipo_despacho, determinaciones_movidas) 
                 VALUES ($1, $2, 'SALIDA', $3, $4, $5, $6, $7, $8, $9, $10, 'EMPAQUE_COMPLETO', 0);"
            )
            .bind(payload.insumo_id)
            .bind(lote_id)
            .bind(restar)
            .bind(stock_lote)
            .bind(nuevo_stock)
            .bind(payload.personal_dni.trim())
            .bind(payload.personal_nombre.trim().to_uppercase())
            .bind(payload.personal_area.trim().to_uppercase())
            .bind(payload.personal_cargo.trim().to_uppercase())
            .bind(payload.usuario_registro.trim().to_uppercase())
            .execute(&mut *tx)
            .await;

            cant_por_descontar -= restar;
        }
    }

    if let Err(e) = tx.commit().await {
        eprintln!("❌ Error en commit de salida: {:?}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al confirmar la salida"}))).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({"status": "success", "message": format!("Despacho de {} registrado correctamente.", payload.cantidad)})),
    ).into_response()
}

/// 4. POST: Registrar ingreso / remesa
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
        "INSERT INTO public.lab_lotes 
         (insumo_id, numero_lote, fecha_ingreso, fecha_vencimiento, stock_actual, empaques_enteros, determinaciones_abiertas) 
         VALUES ($1, $2, $3::DATE, NULLIF($4, '')::DATE, $5, $5, 0) RETURNING id;"
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
         (insumo_id, lote_id, tipo, cantidad, stock_anterior, stock_posterior, usuario_registro, tipo_despacho, determinaciones_movidas) 
         VALUES ($1, $2, 'INGRESO', $3, 0, $3, $4, 'EMPAQUE_COMPLETO', 0);"
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
        Json(json!({"status": "success", "message": format!("Ingreso de {} registrado bajo el lote '{}'.", payload.cantidad, num_lote)})),
    ).into_response()
}

/// 5. GET: Autocompletar personal
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

/// 6. GET: Selector con respaldo ante lotes sin sincronizar
pub async fn selector_insumos_activos(State(state): State<AppState>) -> Response {
    let query = "
        SELECT 
            i.id,
            i.codigo,
            UPPER(i.descripcion) AS descripcion,
            UPPER(COALESCE(i.presentacion, 'UNIDAD')) AS presentacion,
            COALESCE(i.es_fraccionable, FALSE) AS es_fraccionable,
            COALESCE(i.determinaciones_por_empaque, 1) AS determinaciones_por_empaque,
            COALESCE(SUM(
                CASE 
                    WHEN COALESCE(l.empaques_enteros, 0) > 0 THEN l.empaques_enteros
                    WHEN COALESCE(l.determinaciones_abiertas, 0) > 0 THEN 0
                    ELSE l.stock_actual
                END
            ), 0)::BIGINT AS empaques_disponibles,
            COALESCE(SUM(COALESCE(l.determinaciones_abiertas, 0)), 0)::BIGINT AS det_abiertas_disponibles,
            COALESCE(SUM(l.stock_actual), 0)::BIGINT AS stock_disponible
        FROM public.lab_insumos i
        LEFT JOIN public.lab_lotes l ON i.id = l.insumo_id AND l.stock_actual > 0
        WHERE i.estado = 1
        GROUP BY i.id, i.codigo, i.descripcion, i.presentacion, i.es_fraccionable, i.determinaciones_por_empaque
        ORDER BY i.descripcion ASC;
    ";

    match sqlx::query_as::<_, InsumoSelectorRecord>(query).fetch_all(&state.db_auth).await {
        Ok(lista) => (StatusCode::OK, Json(json!({"status": "success", "data": lista}))).into_response(),
        Err(err) => {
            eprintln!("❌ Error SQL en selector_insumos_activos: {:?}", err);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al cargar reactivos"}))).into_response()
        }
    }
}

/// 7. DELETE: Anular salida y retornar stock
pub async fn anular_salida(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Response {
    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(_) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al iniciar transacción"})),
        ).into_response(),
    };

    let mov = match sqlx::query_as::<_, (i32, Option<i32>, i32, Option<String>, Option<i32>)>(
        "SELECT insumo_id, lote_id, cantidad, tipo_despacho, determinaciones_movidas 
         FROM public.lab_movimientos WHERE id = $1 AND tipo = 'SALIDA';"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await {
        Ok(Some(m)) => m,
        _ => return (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": "Movimiento no encontrado"})),
        ).into_response(),
    };

    let (_insumo_id, lote_id_opt, cantidad, tipo_despacho_opt, det_movidas_opt) = mov;
    let tipo_despacho = tipo_despacho_opt.unwrap_or_else(|| "UNIDAD".to_string());

    if let Some(lote_id) = lote_id_opt {
        if tipo_despacho == "FRACCION_DET" {
            let det_a_devolver = det_movidas_opt.unwrap_or(cantidad);
            let _ = sqlx::query(
                "UPDATE public.lab_lotes 
                 SET determinaciones_abiertas = determinaciones_abiertas + $1 
                 WHERE id = $2;"
            )
            .bind(det_a_devolver)
            .bind(lote_id)
            .execute(&mut *tx)
            .await;
        } else {
            let _ = sqlx::query(
                "UPDATE public.lab_lotes 
                 SET empaques_enteros = empaques_enteros + $1, stock_actual = stock_actual + $1 
                 WHERE id = $2;"
            )
            .bind(cantidad)
            .bind(lote_id)
            .execute(&mut *tx)
            .await;
        }
    }

    let _ = sqlx::query("DELETE FROM public.lab_movimientos WHERE id = $1;").bind(id).execute(&mut *tx).await;

    if let Err(_) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al confirmar anulación"}))).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({"status": "success", "message": "Salida anulada y stock reintegrado con éxito."})),
    ).into_response()
}

/// 8. PUT: Actualizar salida (personal y cantidad con reversión atómica en lote)
pub async fn actualizar_salida(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(payload): Json<EditarSalidaRequest>,
) -> Response {
    if payload.cantidad_nueva <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "La cantidad debe ser mayor a cero."})),
        ).into_response();
    }

    let mut tx = match state.db_auth.begin().await {
        Ok(t) => t,
        Err(_) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al iniciar transacción."})),
        ).into_response(),
    };

    let mov = match sqlx::query_as::<_, (i32, Option<i32>, i32, Option<String>, Option<i32>, bool, i32)>(
        "SELECT m.insumo_id, m.lote_id, m.cantidad, m.tipo_despacho, m.determinaciones_movidas,
                COALESCE(i.es_fraccionable, FALSE), COALESCE(i.determinaciones_por_empaque, 1)
         FROM public.lab_movimientos m
         JOIN public.lab_insumos i ON m.insumo_id = i.id
         WHERE m.id = $1 AND m.tipo = 'SALIDA';"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await {
        Ok(Some(m)) => m,
        _ => {
            let _ = tx.rollback().await;
            return (StatusCode::NOT_FOUND, Json(json!({"status": "error", "message": "Salida no encontrada."}))).into_response();
        }
    };

    let (_insumo_id, lote_id_opt, cant_anterior, tipo_desp_opt, det_anterior_opt, es_fraccionable, factor_det) = mov;
    let tipo_despacho = tipo_desp_opt.unwrap_or_else(|| "UNIDAD".to_string());

    if let Some(lote_id) = lote_id_opt {
        let lote_data = sqlx::query_as::<_, (i32, i32, i32)>(
            "SELECT stock_actual, COALESCE(empaques_enteros, 0), COALESCE(determinaciones_abiertas, 0)
             FROM public.lab_lotes WHERE id = $1 FOR UPDATE;"
        )
        .bind(lote_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

        if let Some((stock_lote, mut empaques, mut abiertas)) = lote_data {
            if empaques == 0 && abiertas == 0 && stock_lote > 0 {
                empaques = stock_lote;
            }

            if es_fraccionable && tipo_despacho == "FRACCION_DET" {
                let det_devolver = det_anterior_opt.unwrap_or(cant_anterior);
                abiertas += det_devolver;
                while abiertas >= factor_det && factor_det > 1 {
                    abiertas -= factor_det;
                    empaques += 1;
                }

                let total_det_disp = (empaques * factor_det) + abiertas;
                if payload.cantidad_nueva > total_det_disp {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({
                            "status": "error",
                            "message": format!("Determinaciones insuficientes tras reajuste. Disponibles: {}, solicitadas: {}", total_det_disp, payload.cantidad_nueva)
                        })),
                    ).into_response();
                }

                let mut por_descontar = payload.cantidad_nueva;
                while por_descontar > 0 && (abiertas > 0 || empaques > 0) {
                    if abiertas == 0 && empaques > 0 {
                        empaques -= 1;
                        abiertas = factor_det;
                    }
                    let restar = por_descontar.min(abiertas);
                    abiertas -= restar;
                    por_descontar -= restar;
                }

                let nuevo_stock = empaques + (if abiertas > 0 { 1 } else { 0 });
                let _ = sqlx::query(
                    "UPDATE public.lab_lotes SET stock_actual = $1, empaques_enteros = $2, determinaciones_abiertas = $3 WHERE id = $4;"
                )
                .bind(nuevo_stock)
                .bind(empaques)
                .bind(abiertas)
                .bind(lote_id)
                .execute(&mut *tx)
                .await;

                let _ = sqlx::query(
                    "UPDATE public.lab_movimientos 
                     SET cantidad = $1, determinaciones_movidas = $1, stock_posterior = $2,
                         personal_dni = $3, personal_nombre = $4, personal_area = $5, personal_cargo = $6
                     WHERE id = $7;"
                )
                .bind(payload.cantidad_nueva)
                .bind(nuevo_stock)
                .bind(payload.personal_dni.trim())
                .bind(payload.personal_nombre.trim().to_uppercase())
                .bind(payload.personal_area.trim().to_uppercase())
                .bind(payload.personal_cargo.trim().to_uppercase())
                .bind(id)
                .execute(&mut *tx)
                .await;
            } else {
                empaques += cant_anterior;
                if payload.cantidad_nueva > empaques {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({
                            "status": "error",
                            "message": format!("Stock insuficiente en lote. Disponible: {}, solicitado: {}", empaques, payload.cantidad_nueva)
                        })),
                    ).into_response();
                }

                empaques -= payload.cantidad_nueva;
                let nuevo_stock = empaques + (if abiertas > 0 { 1 } else { 0 });

                let _ = sqlx::query(
                    "UPDATE public.lab_lotes SET stock_actual = $1, empaques_enteros = $2 WHERE id = $3;"
                )
                .bind(nuevo_stock)
                .bind(empaques)
                .bind(lote_id)
                .execute(&mut *tx)
                .await;

                let _ = sqlx::query(
                    "UPDATE public.lab_movimientos 
                     SET cantidad = $1, stock_posterior = $2,
                         personal_dni = $3, personal_nombre = $4, personal_area = $5, personal_cargo = $6
                     WHERE id = $7;"
                )
                .bind(payload.cantidad_nueva)
                .bind(nuevo_stock)
                .bind(payload.personal_dni.trim())
                .bind(payload.personal_nombre.trim().to_uppercase())
                .bind(payload.personal_area.trim().to_uppercase())
                .bind(payload.personal_cargo.trim().to_uppercase())
                .bind(id)
                .execute(&mut *tx)
                .await;
            }
        }
    }

    if let Err(_) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"status": "error", "message": "Error al confirmar la actualización."})),
        ).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({"status": "success", "message": "Salida y stock actualizados correctamente."})),
    ).into_response()
}