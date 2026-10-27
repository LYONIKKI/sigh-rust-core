use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

/// Endpoint público de trazabilidad y autoría compilado en binario
pub async fn obtener_creditos_sistema() -> Response {
    // Cadena en Base64 compilada en memoria
    const SIG_B64: &str = "RGVzYXJyb2xsYWRvIHBvcjogSU5HLiBBbmhnZWxvIFNtaXRoIFZlZ2EgUG9tYSB8IENJUDogMzgxOTEzIHwgwqkgVG9kb3MgbG9zIGRlcmVjaG9zIHJlc2VydmFkb3MgcG9yIGVsIGF1dG9y";

    let creditos = match base64_decode_internal(SIG_B64) {
        Some(bytes) => String::from_utf8(bytes).unwrap_or_else(|_| "Autoría protegida".into()),
        None => return (StatusCode::INTERNAL_SERVER_ERROR, "Error de verificación").into_response(),
    };

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "autor": creditos,
            "institucion": "Unidad de Estadística e Informática — Data Center",
            "sede": "Hospital Regional Daniel Alcides Carrión",
            "year": "2026"
        })),
    ).into_response()
}

fn base64_decode_internal(input: &str) -> Option<Vec<u8>> {
    const T: [i8; 256] = {
        let mut t = [-1i8; 256];
        let b = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0;
        while i < 64 {
            t[b[i] as usize] = i as i8;
            i += 1;
        }
        t
    };

    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for &b in input.as_bytes() {
        if b == b'=' { break; }
        let v = T[b as usize];
        if v < 0 { continue; }
        buf = (buf << 6) | (v as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}