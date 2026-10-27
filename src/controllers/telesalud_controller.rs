use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use crate::models::telesalud::{GuardarFuaRequest, TelesaludFuaRecord, TelesaludHoyRecord};
use crate::config::AppState;

#[derive(Deserialize)]
pub struct ActualizarFuaRequest {
    pub fua_numero_editado: String,
    pub usuario_registro: String,
}

/// 1. GET: Buscar por cuenta de atención
pub async fn consultar_fua_telesalud(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Response {
    let mut client = state.db_sql.lock().await;

    // Convertimos CitaFecha a texto (formato ISO 120) y forzamos UPPER en nombres
    let query = "
        SELECT 
            sfa.idCuentaAtencion,
            sfa.FuaNumero AS FuaNumeroOriginal,
            sfa.DocumentoNumero,
            ISNULL(NULLIF(RTRIM(LTRIM(ace.NroHistoriaClinica)), ''), sfa.DocumentoNumero) AS NroHistoriaClinica,
            UPPER(RTRIM(LTRIM(ISNULL(sfa.Apaterno, '') + ' ' + ISNULL(sfa.Amaterno, '') + ', ' + ISNULL(sfa.Pnombre, '') + ' ' + ISNULL(sfa.Onombre, '')))) AS PacienteNombre,
            sfa.fnacimiento,
            UPPER(sfa.FuaMedico) AS FuaMedico,
            UPPER(ace.CitaServicioJamo) AS CitaServicioJamo,
            CONVERT(VARCHAR(19), ace.CitaFecha, 120) AS CitaFecha,
            tel.FuaNumeroEditado
        FROM dbo.SisFuaAtencion sfa
        LEFT JOIN dbo.atencionesCE ace ON sfa.idCuentaAtencion = ace.idAtencion
        LEFT JOIN dbo.telesalud tel ON sfa.idCuentaAtencion = tel.idCuentaAtencion
        WHERE sfa.idCuentaAtencion = @P1;
    ";

    let stream = match client.query(query, &[&id]).await {
        Ok(s) => s,
        Err(err) => {
            eprintln!("❌ Error ejecutando query en Tiberius: {:?}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al consultar la base de datos clínica"})),
            ).into_response();
        }
    };

    match stream.into_row().await {
        Ok(Some(row)) => {
            let record = TelesaludFuaRecord {
                id_cuenta_atencion: row.try_get::<i32, _>("idCuentaAtencion").ok().flatten().unwrap_or(id),
                fua_numero_original: row.try_get::<&str, _>("FuaNumeroOriginal").ok().flatten().map(|s| s.trim().to_string()),
                documento_numero: row.try_get::<&str, _>("DocumentoNumero").ok().flatten().map(|s| s.trim().to_string()),
                nro_historia_clinica: row.try_get::<&str, _>("NroHistoriaClinica").ok().flatten().map(|s| s.trim().to_string()),
                paciente_nombre: row.try_get::<&str, _>("PacienteNombre").ok().flatten().map(|s| s.trim().to_string()),
                fnacimiento: row.try_get::<&str, _>("fnacimiento").ok().flatten().map(|s| s.trim().to_string()),
                fua_medico: row.try_get::<&str, _>("FuaMedico").ok().flatten().map(|s| s.trim().to_string()),
                cita_servicio_jamo: row.try_get::<&str, _>("CitaServicioJamo").ok().flatten().map(|s| s.trim().to_string()),
                cita_fecha: row.try_get::<&str, _>("CitaFecha").ok().flatten().map(|s| s.trim().to_string()),
                fua_numero_editado: row.try_get::<&str, _>("FuaNumeroEditado").ok().flatten().map(|s| s.trim().to_string()),
            };

            (StatusCode::OK, Json(json!({"status": "success", "data": record}))).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"status": "error", "message": format!("No se encontró ninguna atención con idCuentaAtencion = {}", id)})),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error procesando fila: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al procesar los datos de la respuesta"})),
            ).into_response()
        }
    }
}

/// 2. GET: Calcular siguiente FUA sugerido
pub async fn obtener_siguiente_fua(State(state): State<AppState>) -> Response {
    let mut client = state.db_sql.lock().await;

    let query = "
        SELECT ISNULL(MAX(CAST(FuaNumeroEditado AS INT)), 56999) + 1 AS SiguienteFua
        FROM dbo.telesalud
        WHERE ISNUMERIC(FuaNumeroEditado) = 1;
    ";

    match client.query(query, &[]).await {
        Ok(stream) => match stream.into_row().await {
            Ok(Some(row)) => {
                let sig: i32 = row.try_get::<i32, _>("SiguienteFua").ok().flatten().unwrap_or(57000);
                let fua_formateado = format!("{:08}", sig);
                (
                    StatusCode::OK,
                    Json(json!({
                        "status": "success",
                        "siguiente_fua": fua_formateado,
                        "numero": sig
                    })),
                ).into_response()
            }
            _ => (
                StatusCode::OK,
                Json(json!({"status": "success", "siguiente_fua": "00057000", "numero": 57000})),
            ).into_response(),
        },
        Err(err) => {
            eprintln!("❌ Error obteniendo correlativo: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al calcular el siguiente FUA"})),
            ).into_response()
        }
    }
}

/// 3. GET: Listar atenciones de hoy
pub async fn listar_fuas_hoy(State(state): State<AppState>) -> Response {
    let mut client = state.db_sql.lock().await;

    let query = "
        SELECT 
            idCuentaAtencion,
            FuaNumeroOriginal,
            FuaNumeroEditado,
            DocumentoNumero,
            NroHistoriaClinica,
            UPPER(PacienteNombre) AS PacienteNombre,
            UPPER(FuaMedico) AS FuaMedico,
            UPPER(CitaServicioJamo) AS CitaServicioJamo,
            CONVERT(VARCHAR(8), FechaRegistro, 108) AS HoraRegistro,
            UPPER(UsuarioRegistro) AS UsuarioRegistro
        FROM dbo.telesalud
        WHERE CAST(FechaRegistro AS DATE) = CAST(GETDATE() AS DATE)
        ORDER BY FechaRegistro DESC;
    ";

    match client.query(query, &[]).await {
        Ok(stream) => {
            let rows = match stream.into_first_result().await {
                Ok(r) => r,
                Err(err) => {
                    eprintln!("❌ Error consumiendo registros del día: {:?}", err);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"status": "error", "message": "Error al leer filas del día"})),
                    ).into_response();
                }
            };

            let mut lista: Vec<TelesaludHoyRecord> = Vec::new();
            for row in rows {
                lista.push(TelesaludHoyRecord {
                    id_cuenta_atencion: row.try_get::<i32, _>("idCuentaAtencion").ok().flatten().unwrap_or(0),
                    fua_numero_original: row.try_get::<&str, _>("FuaNumeroOriginal").ok().flatten().map(|s| s.trim().to_string()),
                    fua_numero_editado: row.try_get::<&str, _>("FuaNumeroEditado").ok().flatten().unwrap_or("").trim().to_string(),
                    documento_numero: row.try_get::<&str, _>("DocumentoNumero").ok().flatten().map(|s| s.trim().to_string()),
                    nro_historia_clinica: row.try_get::<&str, _>("NroHistoriaClinica").ok().flatten().map(|s| s.trim().to_string()),
                    paciente_nombre: row.try_get::<&str, _>("PacienteNombre").ok().flatten().map(|s| s.trim().to_string()),
                    fua_medico: row.try_get::<&str, _>("FuaMedico").ok().flatten().map(|s| s.trim().to_string()),
                    cita_servicio_jamo: row.try_get::<&str, _>("CitaServicioJamo").ok().flatten().map(|s| s.trim().to_string()),
                    hora_registro: row.try_get::<&str, _>("HoraRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                    usuario_registro: row.try_get::<&str, _>("UsuarioRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                });
            }

            (StatusCode::OK, Json(json!({"status": "success", "total": lista.len(), "data": lista}))).into_response()
        }
        Err(err) => {
            eprintln!("❌ Error listando registros del día: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al obtener las atenciones de hoy"})),
            ).into_response()
        }
    }
}

/// 4. POST: Guardar atención
pub async fn guardar_fua_telesalud(
    State(state): State<AppState>,
    Json(payload): Json<GuardarFuaRequest>,
) -> Response {
    let fua_limpio = payload.fua_numero_editado.trim();
    if fua_limpio.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "El número de FUA editado no puede estar vacío."})),
        ).into_response();
    }

    if let Ok(num) = fua_limpio.parse::<i32>() {
        if num < 57000 || num > 60000 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "error",
                    "message": format!("El FUA {} está fuera del lote de Telesalud (57000 al 60000).", num)
                })),
            ).into_response();
        }
    }

    let mut client = state.db_sql.lock().await;

    let insert_query = "
        INSERT INTO dbo.telesalud (
            idCuentaAtencion,
            FuaNumeroOriginal,
            DocumentoNumero,
            NroHistoriaClinica,
            PacienteNombre,
            fnacimiento,
            FuaMedico,
            CitaServicioJamo,
            CitaFecha,
            FuaNumeroEditado,
            UsuarioRegistro,
            FechaRegistro
        ) VALUES (
            @P1, @P2, @P3, @P4, UPPER(@P5), @P6, UPPER(@P7), UPPER(@P8), @P9, @P10, UPPER(@P11), GETDATE()
        );
    ";

    let fua_orig = payload.fua_numero_original.as_deref();
    let doc_num = payload.documento_numero.as_deref();
    let nro_hc = payload.nro_historia_clinica.as_deref();
    let pac_nom = payload.paciente_nombre.as_deref();
    let fnac = payload.fnacimiento.as_deref();
    let fua_med = payload.fua_medico.as_deref();
    let servicio = payload.cita_servicio_jamo.as_deref();
    let fecha = payload.cita_fecha.as_deref();
    let usuario = payload.usuario_registro.trim();

    let result = client.execute(
        insert_query,
        &[
            &payload.id_cuenta_atencion,
            &fua_orig,
            &doc_num,
            &nro_hc,
            &pac_nom,
            &fnac,
            &fua_med,
            &servicio,
            &fecha,
            &fua_limpio,
            &usuario,
        ],
    ).await;

    match result {
        Ok(_) => (
            StatusCode::CREATED,
            Json(json!({
                "status": "success",
                "message": format!("FUA {} asignado exitosamente a la cuenta {}", fua_limpio, payload.id_cuenta_atencion)
            })),
        ).into_response(),
        Err(err) => {
            let err_msg = format!("{:?}", err);
            eprintln!("❌ Error insertando en dbo.telesalud: {}", err_msg);

            if err_msg.contains("2627") || err_msg.contains("2601") || err_msg.contains("UQ_telesalud_FuaEditado") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({
                        "status": "error",
                        "message": format!("Conflicto: El número de FUA {} ya ha sido asignado a otro paciente o esta cuenta ya fue procesada.", fua_limpio)
                    })),
                ).into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error interno al registrar el FUA en la base de datos."})),
                ).into_response()
            }
        }
    }
}

/// 5. PUT: Actualizar FUA asignado (Edición)
pub async fn actualizar_fua_telesalud(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(payload): Json<ActualizarFuaRequest>,
) -> Response {
    let fua_limpio = payload.fua_numero_editado.trim();
    if fua_limpio.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "El FUA editado no puede estar vacío."})),
        ).into_response();
    }

    if let Ok(num) = fua_limpio.parse::<i32>() {
        if num < 57000 || num > 60000 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "error",
                    "message": format!("El FUA {} está fuera del rango autorizado (57000 - 60000).", num)
                })),
            ).into_response();
        }
    }

    let mut client = state.db_sql.lock().await;

    let update_query = "
        UPDATE dbo.telesalud
        SET FuaNumeroEditado = @P1,
            UsuarioRegistro = UPPER(@P2),
            FechaRegistro = GETDATE()
        WHERE idCuentaAtencion = @P3;
    ";

    let usuario = payload.usuario_registro.trim();
    let result = client.execute(update_query, &[&fua_limpio, &usuario, &id]).await;

    match result {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("FUA de la cuenta {} actualizado exitosamente a {}", id, fua_limpio)
            })),
        ).into_response(),
        Err(err) => {
            let err_msg = format!("{:?}", err);
            eprintln!("❌ Error actualizando dbo.telesalud: {}", err_msg);

            if err_msg.contains("2627") || err_msg.contains("2601") || err_msg.contains("UQ_telesalud_FuaEditado") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({
                        "status": "error",
                        "message": format!("Conflicto: El FUA {} ya está en uso por otra cuenta.", fua_limpio)
                    })),
                ).into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error interno al actualizar el FUA."})),
                ).into_response()
            }
        }
    }
}

/// 6. DELETE: Eliminar / Desvincular atención de Telesalud
pub async fn eliminar_fua_telesalud(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Response {
    let mut client = state.db_sql.lock().await;

    let delete_query = "DELETE FROM dbo.telesalud WHERE idCuentaAtencion = @P1;";
    match client.execute(delete_query, &[&id]).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("Atención {} desvinculada exitosamente de Telesalud.", id)
            })),
        ).into_response(),
        Err(err) => {
            eprintln!("❌ Error eliminando registro: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "No se pudo eliminar el registro."})),
            ).into_response()
        }
    }
}