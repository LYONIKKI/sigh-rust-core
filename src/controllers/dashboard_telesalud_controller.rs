use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use crate::models::dashboard_telesalud::{
    DetalleRastreoFuaRecord, FiltroHistorialParams, FuaHistorialRecord,
};
use crate::config::AppState;

/// 1. GET /api/telesalud/dashboard/historial
/// Lista historial con filtro de fechas, sin nro documento, médico ni fecha nacimiento
pub async fn listar_historial_fuas(
    State(state): State<AppState>,
    Query(params): Query<FiltroHistorialParams>,
) -> Response {
    let mut client = state.db_sql.lock().await;

    let desde = params.desde.unwrap_or_else(|| "2020-01-01".to_string());
    let hasta = params.hasta.unwrap_or_else(|| "2099-12-31".to_string());
    let filtro = format!("%{}%", params.q.unwrap_or_default().trim().to_uppercase());

    let query = "
        SELECT 
            idCuentaAtencion,
            UPPER(ISNULL(PacienteNombre, '---')) AS PacienteNombre,
            ISNULL(NroHistoriaClinica, '---') AS NroHistoriaClinica,
            FuaNumeroOriginal,
            FuaNumeroEditado,
            FuaFarmacia,
            FuaLaboratorio,
            FuaImagenes,
            UPPER(UsuarioRegistro) AS UsuarioRegistro,
            CONVERT(VARCHAR(19), FechaRegistro, 120) AS FechaRegistro
        FROM dbo.telesalud
        WHERE CAST(FechaRegistro AS DATE) BETWEEN CAST(@P1 AS DATE) AND CAST(@P2 AS DATE)
          AND (
                PacienteNombre LIKE @P3 
             OR CAST(idCuentaAtencion AS VARCHAR(20)) LIKE @P3 
             OR FuaNumeroEditado LIKE @P3
             OR ISNULL(FuaFarmacia, '') LIKE @P3
             OR ISNULL(FuaLaboratorio, '') LIKE @P3
             OR ISNULL(FuaImagenes, '') LIKE @P3
          )
        ORDER BY FechaRegistro DESC;
    ";

    match client.query(query, &[&desde, &hasta, &filtro]).await {
        Ok(stream) => {
            let rows = match stream.into_first_result().await {
                Ok(r) => r,
                Err(err) => {
                    eprintln!("❌ Error leyendo historial: {:?}", err);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"status": "error", "message": "Error al leer filas del historial"})),
                    ).into_response();
                }
            };

            let mut lista: Vec<FuaHistorialRecord> = Vec::new();
            for row in rows {
                lista.push(FuaHistorialRecord {
                    id_cuenta_atencion: row.try_get::<i32, _>("idCuentaAtencion").ok().flatten().unwrap_or(0),
                    paciente_nombre: row.try_get::<&str, _>("PacienteNombre").ok().flatten().map(|s| s.trim().to_string()),
                    nro_historia_clinica: row.try_get::<&str, _>("NroHistoriaClinica").ok().flatten().map(|s| s.trim().to_string()),
                    fua_numero_original: row.try_get::<&str, _>("FuaNumeroOriginal").ok().flatten().map(|s| s.trim().to_string()),
                    fua_numero_editado: row.try_get::<&str, _>("FuaNumeroEditado").ok().flatten().unwrap_or("").trim().to_string(),
                    fua_farmacia: row.try_get::<&str, _>("FuaFarmacia").ok().flatten().map(|s| s.trim().to_string()),
                    fua_laboratorio: row.try_get::<&str, _>("FuaLaboratorio").ok().flatten().map(|s| s.trim().to_string()),
                    fua_imagenes: row.try_get::<&str, _>("FuaImagenes").ok().flatten().map(|s| s.trim().to_string()),
                    usuario_registro: row.try_get::<&str, _>("UsuarioRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                    fecha_registro: row.try_get::<&str, _>("FechaRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                });
            }

            (StatusCode::OK, Json(json!({"status": "success", "total": lista.len(), "data": lista}))).into_response()
        }
        Err(err) => {
            eprintln!("❌ Error listando historial Telesalud: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al consultar historial en SQL Server"})),
            ).into_response()
        }
    }
}

/// 2. GET /api/telesalud/dashboard/rastrear/{fua}
/// Rastrea a qué paciente y cuenta corresponde cualquier FUA (Atención, Farmacia, Lab o Imágenes)
pub async fn rastrear_fua_especifico(
    State(state): State<AppState>,
    Path(fua): Path<String>,
) -> Response {
    let mut client = state.db_sql.lock().await;
    let fua_buscado = fua.trim();

    let query = "
        SELECT TOP 1
            idCuentaAtencion,
            DocumentoNumero,
            NroHistoriaClinica,
            UPPER(PacienteNombre) AS PacienteNombre,
            fnacimiento,
            UPPER(FuaMedico) AS FuaMedico,
            UPPER(CitaServicioJamo) AS CitaServicioJamo,
            CONVERT(VARCHAR(19), CitaFecha, 120) AS CitaFecha,
            FuaNumeroOriginal,
            FuaNumeroEditado,
            FuaFarmacia,
            FuaLaboratorio,
            FuaImagenes,
            UPPER(UsuarioRegistro) AS UsuarioRegistro,
            CONVERT(VARCHAR(19), FechaRegistro, 120) AS FechaRegistro,
            CASE 
                WHEN FuaNumeroEditado = @P1 THEN 'FUA DE ATENCIÓN MÉDICA'
                WHEN FuaFarmacia = @P1 THEN 'FUA DE FARMACIA'
                WHEN FuaLaboratorio = @P1 THEN 'FUA DE LABORATORIO'
                WHEN FuaImagenes = @P1 THEN 'FUA DE IMÁGENES'
                ELSE 'FUA ASOCIADO'
            END AS TipoCoincidente
        FROM dbo.telesalud
        WHERE FuaNumeroEditado = @P1 
           OR FuaFarmacia = @P1 
           OR FuaLaboratorio = @P1 
           OR FuaImagenes = @P1;
    ";

    match client.query(query, &[&fua_buscado]).await {
        Ok(stream) => match stream.into_row().await {
            Ok(Some(row)) => {
                let detalle = DetalleRastreoFuaRecord {
                    id_cuenta_atencion: row.try_get::<i32, _>("idCuentaAtencion").ok().flatten().unwrap_or(0),
                    documento_numero: row.try_get::<&str, _>("DocumentoNumero").ok().flatten().map(|s| s.trim().to_string()),
                    nro_historia_clinica: row.try_get::<&str, _>("NroHistoriaClinica").ok().flatten().map(|s| s.trim().to_string()),
                    paciente_nombre: row.try_get::<&str, _>("PacienteNombre").ok().flatten().map(|s| s.trim().to_string()),
                    fnacimiento: row.try_get::<&str, _>("fnacimiento").ok().flatten().map(|s| s.trim().to_string()),
                    fua_medico: row.try_get::<&str, _>("FuaMedico").ok().flatten().map(|s| s.trim().to_string()),
                    cita_servicio_jamo: row.try_get::<&str, _>("CitaServicioJamo").ok().flatten().map(|s| s.trim().to_string()),
                    cita_fecha: row.try_get::<&str, _>("CitaFecha").ok().flatten().map(|s| s.trim().to_string()),
                    fua_numero_original: row.try_get::<&str, _>("FuaNumeroOriginal").ok().flatten().map(|s| s.trim().to_string()),
                    fua_numero_editado: row.try_get::<&str, _>("FuaNumeroEditado").ok().flatten().unwrap_or("").trim().to_string(),
                    fua_farmacia: row.try_get::<&str, _>("FuaFarmacia").ok().flatten().map(|s| s.trim().to_string()),
                    fua_laboratorio: row.try_get::<&str, _>("FuaLaboratorio").ok().flatten().map(|s| s.trim().to_string()),
                    fua_imagenes: row.try_get::<&str, _>("FuaImagenes").ok().flatten().map(|s| s.trim().to_string()),
                    usuario_registro: row.try_get::<&str, _>("UsuarioRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                    fecha_registro: row.try_get::<&str, _>("FechaRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                    tipo_fua_coincidente: row.try_get::<&str, _>("TipoCoincidente").ok().flatten().unwrap_or("").trim().to_string(),
                };

                (StatusCode::OK, Json(json!({"status": "success", "data": detalle}))).into_response()
            }
            Ok(None) => (
                StatusCode::NOT_FOUND,
                Json(json!({"status": "error", "message": format!("No se encontró ninguna atención vinculada al FUA '{}'", fua_buscado)})),
            ).into_response(),
            Err(err) => {
                eprintln!("❌ Error procesando rastreo: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error al procesar rastreo"}))).into_response()
            }
        },
        Err(err) => {
            eprintln!("❌ Error rastreando FUA: {:?}", err);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"status": "error", "message": "Error de base de datos al rastrear FUA"}))).into_response()
        }
    }
}