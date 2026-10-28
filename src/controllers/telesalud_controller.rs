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
    pub fua_farmacia: Option<String>,
    pub fua_laboratorio: Option<String>,
    pub fua_imagenes: Option<String>,
    pub usuario_registro: String,
}

fn limpiar_fua_opcional(fua: Option<String>) -> Result<Option<String>, String> {
    match fua {
        Some(val) => {
            let limpia = val.trim();
            if limpia.is_empty() {
                Ok(None)
            } else {
                if let Ok(num) = limpia.parse::<i32>() {
                    if num < 57000 || num > 60000 {
                        return Err(format!("El FUA {} está fuera del rango permitido (57000 - 60000)", num));
                    }
                }
                Ok(Some(limpia.to_string()))
            }
        }
        None => Ok(None),
    }
}

/// 1. GET: Consultar cuenta en GalenHos incluyendo Servicio y Fecha de Cita
pub async fn consultar_fua_telesalud(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Response {
    let mut client = state.db_sql.lock().await;

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
            tel.FuaNumeroEditado,
            tel.FuaFarmacia,
            tel.FuaLaboratorio,
            tel.FuaImagenes
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
                Json(json!({"status": "error", "message": "Error al consultar base de datos clínica"})),
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
                fua_farmacia: row.try_get::<&str, _>("FuaFarmacia").ok().flatten().map(|s| s.trim().to_string()),
                fua_laboratorio: row.try_get::<&str, _>("FuaLaboratorio").ok().flatten().map(|s| s.trim().to_string()),
                fua_imagenes: row.try_get::<&str, _>("FuaImagenes").ok().flatten().map(|s| s.trim().to_string()),
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

/// 2. GET: Calcular siguiente correlativo considerando las 4 columnas de FUAs
pub async fn obtener_siguiente_fua(State(state): State<AppState>) -> Response {
    let mut client = state.db_sql.lock().await;

    let query = "
        SELECT ISNULL(MAX(val), 56999) + 1 AS SiguienteFua
        FROM (
            SELECT CAST(FuaNumeroEditado AS INT) AS val FROM dbo.telesalud WHERE ISNUMERIC(FuaNumeroEditado) = 1
            UNION ALL
            SELECT CAST(FuaFarmacia AS INT) AS val FROM dbo.telesalud WHERE ISNUMERIC(FuaFarmacia) = 1
            UNION ALL
            SELECT CAST(FuaLaboratorio AS INT) AS val FROM dbo.telesalud WHERE ISNUMERIC(FuaLaboratorio) = 1
            UNION ALL
            SELECT CAST(FuaImagenes AS INT) AS val FROM dbo.telesalud WHERE ISNUMERIC(FuaImagenes) = 1
        ) AS CorrelativosGlobales;
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

/// 3. GET: Listar atenciones de los últimos 5 días (orden cronológico descendente)
pub async fn listar_fuas_hoy(State(state): State<AppState>) -> Response {
    let mut client = state.db_sql.lock().await;

    let query = "
        SELECT 
            idCuentaAtencion,
            FuaNumeroOriginal,
            FuaNumeroEditado,
            FuaFarmacia,
            FuaLaboratorio,
            FuaImagenes,
            DocumentoNumero,
            NroHistoriaClinica,
            UPPER(PacienteNombre) AS PacienteNombre,
            UPPER(FuaMedico) AS FuaMedico,
            UPPER(CitaServicioJamo) AS CitaServicioJamo,
            CONVERT(VARCHAR(19), CitaFecha, 120) AS CitaFecha,
            CONVERT(VARCHAR(8), FechaRegistro, 108) AS HoraRegistro,
            UPPER(UsuarioRegistro) AS UsuarioRegistro
        FROM dbo.telesalud
        WHERE CAST(FechaRegistro AS DATE) >= DATEADD(DAY, -4, CAST(GETDATE() AS DATE))
        ORDER BY FechaRegistro DESC;
    ";

    match client.query(query, &[]).await {
        Ok(stream) => {
            let rows = match stream.into_first_result().await {
                Ok(r) => r,
                Err(err) => {
                    eprintln!("❌ Error consumiendo registros recientes: {:?}", err);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"status": "error", "message": "Error al leer filas de atenciones recientes"})),
                    ).into_response();
                }
            };

            let mut lista: Vec<TelesaludHoyRecord> = Vec::new();
            for row in rows {
                lista.push(TelesaludHoyRecord {
                    id_cuenta_atencion: row.try_get::<i32, _>("idCuentaAtencion").ok().flatten().unwrap_or(0),
                    fua_numero_original: row.try_get::<&str, _>("FuaNumeroOriginal").ok().flatten().map(|s| s.trim().to_string()),
                    fua_numero_editado: row.try_get::<&str, _>("FuaNumeroEditado").ok().flatten().unwrap_or("").trim().to_string(),
                    fua_farmacia: row.try_get::<&str, _>("FuaFarmacia").ok().flatten().map(|s| s.trim().to_string()),
                    fua_laboratorio: row.try_get::<&str, _>("FuaLaboratorio").ok().flatten().map(|s| s.trim().to_string()),
                    fua_imagenes: row.try_get::<&str, _>("FuaImagenes").ok().flatten().map(|s| s.trim().to_string()),
                    documento_numero: row.try_get::<&str, _>("DocumentoNumero").ok().flatten().map(|s| s.trim().to_string()),
                    nro_historia_clinica: row.try_get::<&str, _>("NroHistoriaClinica").ok().flatten().map(|s| s.trim().to_string()),
                    paciente_nombre: row.try_get::<&str, _>("PacienteNombre").ok().flatten().map(|s| s.trim().to_string()),
                    fua_medico: row.try_get::<&str, _>("FuaMedico").ok().flatten().map(|s| s.trim().to_string()),
                    cita_servicio_jamo: row.try_get::<&str, _>("CitaServicioJamo").ok().flatten().map(|s| s.trim().to_string()),
                    cita_fecha: row.try_get::<&str, _>("CitaFecha").ok().flatten().map(|s| s.trim().to_string()),
                    hora_registro: row.try_get::<&str, _>("HoraRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                    usuario_registro: row.try_get::<&str, _>("UsuarioRegistro").ok().flatten().unwrap_or("").trim().to_string(),
                });
            }

            (StatusCode::OK, Json(json!({"status": "success", "total": lista.len(), "data": lista}))).into_response()
        }
        Err(err) => {
            eprintln!("❌ Error listando registros recientes: {:?}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"status": "error", "message": "Error al obtener las atenciones de los últimos 5 días"})),
            ).into_response()
        }
    }
}

/// 4. POST: Guardar atención con Servicio, Fecha de Cita y las 4 FUAs
pub async fn guardar_fua_telesalud(
    State(state): State<AppState>,
    Json(payload): Json<GuardarFuaRequest>,
) -> Response {
    let fua_atencion = payload.fua_numero_editado.trim();
    if fua_atencion.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "El FUA de atención es obligatorio."})),
        ).into_response();
    }

    if let Ok(num) = fua_atencion.parse::<i32>() {
        if num < 57000 || num > 60000 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "error",
                    "message": format!("El FUA {} está fuera del rango (57000 al 60000).", num)
                })),
            ).into_response();
        }
    }

    let opt_farmacia = match limpiar_fua_opcional(payload.fua_farmacia) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": e}))).into_response(),
    };
    let opt_laboratorio = match limpiar_fua_opcional(payload.fua_laboratorio) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": e}))).into_response(),
    };
    let opt_imagenes = match limpiar_fua_opcional(payload.fua_imagenes) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": e}))).into_response(),
    };

    // Validar duplicidad interna dentro del mismo formulario
    let mut asignados = vec![fua_atencion];
    if let Some(ref f) = opt_farmacia {
        if asignados.contains(&f.as_str()) {
            return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": "El FUA de Farmacia coincide con otro FUA asignado"}))).into_response();
        }
        asignados.push(f.as_str());
    }
    if let Some(ref f) = opt_laboratorio {
        if asignados.contains(&f.as_str()) {
            return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": "El FUA de Laboratorio coincide con otro FUA asignado"}))).into_response();
        }
        asignados.push(f.as_str());
    }
    if let Some(ref f) = opt_imagenes {
        if asignados.contains(&f.as_str()) {
            return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": "El FUA de Imágenes coincide con otro FUA asignado"}))).into_response();
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
            FuaFarmacia,
            FuaLaboratorio,
            FuaImagenes,
            UsuarioRegistro,
            FechaRegistro
        ) VALUES (
            @P1, @P2, @P3, @P4, UPPER(@P5), @P6, UPPER(@P7), UPPER(@P8), @P9, @P10, @P11, @P12, @P13, UPPER(@P14), GETDATE()
        );
    ";

    let fua_orig = payload.fua_numero_original.as_deref();
    let doc_num = payload.documento_numero.as_deref();
    let nro_hc = payload.nro_historia_clinica.as_deref();
    let pac_nom = payload.paciente_nombre.as_deref();
    let fnac = payload.fnacimiento.as_deref();
    let fua_med = payload.fua_medico.as_deref();
    let serv = payload.cita_servicio_jamo.as_deref();
    let cita_f = payload.cita_fecha.as_deref();
    let usuario = payload.usuario_registro.trim();

    let ref_farmacia = opt_farmacia.as_deref();
    let ref_laboratorio = opt_laboratorio.as_deref();
    let ref_imagenes = opt_imagenes.as_deref();

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
            &serv,
            &cita_f,
            &fua_atencion,
            &ref_farmacia,
            &ref_laboratorio,
            &ref_imagenes,
            &usuario,
        ],
    ).await;

    match result {
        Ok(_) => (
            StatusCode::CREATED,
            Json(json!({
                "status": "success",
                "message": format!("FUAs asignados exitosamente a la cuenta {}", payload.id_cuenta_atencion)
            })),
        ).into_response(),
        Err(err) => {
            let err_msg = format!("{:?}", err);
            eprintln!("❌ Error insertando en dbo.telesalud: {}", err_msg);

            if err_msg.contains("2627") || err_msg.contains("2601") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({
                        "status": "error",
                        "message": "Uno de los números de FUA ya se encuentra asignado a otra atención."
                    })),
                ).into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error interno al registrar la atención en la base de datos."})),
                ).into_response()
            }
        }
    }
}

/// 5. PUT: Actualizar los FUAs de una cuenta
pub async fn actualizar_fua_telesalud(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(payload): Json<ActualizarFuaRequest>,
) -> Response {
    let fua_atencion = payload.fua_numero_editado.trim();
    if fua_atencion.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"status": "error", "message": "El FUA de atención no puede estar vacío."})),
        ).into_response();
    }

    let opt_farmacia = match limpiar_fua_opcional(payload.fua_farmacia) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": e}))).into_response(),
    };
    let opt_laboratorio = match limpiar_fua_opcional(payload.fua_laboratorio) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": e}))).into_response(),
    };
    let opt_imagenes = match limpiar_fua_opcional(payload.fua_imagenes) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"status": "error", "message": e}))).into_response(),
    };

    let mut client = state.db_sql.lock().await;

    let update_query = "
        UPDATE dbo.telesalud
        SET FuaNumeroEditado = @P1,
            FuaFarmacia = @P2,
            FuaLaboratorio = @P3,
            FuaImagenes = @P4,
            UsuarioRegistro = UPPER(@P5),
            FechaRegistro = GETDATE()
        WHERE idCuentaAtencion = @P6;
    ";

    let ref_farmacia = opt_farmacia.as_deref();
    let ref_laboratorio = opt_laboratorio.as_deref();
    let ref_imagenes = opt_imagenes.as_deref();
    let usuario = payload.usuario_registro.trim();

    let result = client.execute(update_query, &[&fua_atencion, &ref_farmacia, &ref_laboratorio, &ref_imagenes, &usuario, &id]).await;

    match result {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "message": format!("FUAs de la cuenta {} actualizados exitosamente.", id)
            })),
        ).into_response(),
        Err(err) => {
            let err_msg = format!("{:?}", err);
            eprintln!("❌ Error actualizando dbo.telesalud: {}", err_msg);

            if err_msg.contains("2627") || err_msg.contains("2601") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({
                        "status": "error",
                        "message": "Uno de los números de FUA ya está en uso por otra atención."
                    })),
                ).into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"status": "error", "message": "Error interno al actualizar los FUAs."})),
                ).into_response()
            }
        }
    }
}

/// 6. DELETE: Eliminar / Desvincular registro
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