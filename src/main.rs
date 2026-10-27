// src/main.rs
use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

mod models;
mod controllers;
mod config;
mod middlewares;

use controllers::system_controller::obtener_creditos_sistema;
use controllers::telesalud_controller::{
    actualizar_fua_telesalud,
    consultar_fua_telesalud,
    eliminar_fua_telesalud,
    guardar_fua_telesalud,
    listar_fuas_hoy,
    obtener_siguiente_fua,
};
use controllers::usuario_controller::{
    actualizar_usuario_sigh,
    crear_usuario_sigh,
    eliminar_usuario_sigh,
    listar_usuarios_sigh,
};

use controllers::inventario_lab_controller::{
    actualizar_insumo,
    eliminar_insumo,
    listar_inventario,
    registrar_insumo,
};

use controllers::personal_lab_controller::{
    actualizar_personal, 
    crear_personal, 
    eliminar_personal, 
    listar_personal, 
    obtener_personal_por_id,
};

use controllers::movimientos_lab_controller::{
    actualizar_salida,
    anular_salida,
    autocompletar_personal,
    listar_ingresos,
    listar_salidas,
    registrar_ingreso,
    registrar_salida,
    selector_insumos_activos,
};

use config::init_databases;
use middlewares::{verificar_rol_admin, verificar_rol_lab, verificar_rol_telesalud};
#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let state = init_databases().await;
    let cors = CorsLayer::permissive();

    // 1. Grupo Telesalud (Telesalud + Admin)
    let rutas_telesalud = Router::new()
        .route("/fua/{id}", get(consultar_fua_telesalud))
        .route("/fua/{id}", put(actualizar_fua_telesalud))
        .route("/fua/{id}", delete(eliminar_fua_telesalud))
        .route("/fua", post(guardar_fua_telesalud))
        .route("/fua/siguiente", get(obtener_siguiente_fua))
        .route("/fua/hoy", get(listar_fuas_hoy))
        .route_layer(middleware::from_fn(verificar_rol_telesalud));

    // 2. Grupo Usuarios (Solo Admin)
    let rutas_usuarios = Router::new()
        .route("/", get(listar_usuarios_sigh))
        .route("/", post(crear_usuario_sigh))
        .route("/{id}", put(actualizar_usuario_sigh))
        .route("/{id}", delete(eliminar_usuario_sigh))
        .route_layer(middleware::from_fn(verificar_rol_admin));
    
    let rutas_inventario = Router::new()
        .route("/insumos", get(listar_inventario))
        .route("/insumos", post(registrar_insumo))
        .route("/insumos/{id}", put(actualizar_insumo))
        .route("/insumos/{id}", delete(eliminar_insumo))
        .route_layer(middleware::from_fn(verificar_rol_lab));

    let rutas_movimientos = Router::new()
        .route("/salidas", get(listar_salidas))
        .route("/salidas", post(registrar_salida))
        .route("/salidas/{id}", put(actualizar_salida))
        .route("/salidas/{id}", delete(anular_salida))
        .route("/ingresos", get(listar_ingresos))
        .route("/ingresos", post(registrar_ingreso))
        .route("/personal/buscar", get(autocompletar_personal))
        .route("/insumos/selector", get(selector_insumos_activos))
        .route_layer(middleware::from_fn(verificar_rol_lab));
    
    let rutas_personal = Router::new()
        .route("/", get(listar_personal))
        .route("/", post(crear_personal))
        .route("/{id}", get(obtener_personal_por_id))
        .route("/{id}", put(actualizar_personal))
        .route("/{id}", delete(eliminar_personal))
        .route_layer(middleware::from_fn(verificar_rol_lab));

    let app = Router::new()
        .route("/api/system/creditos", get(obtener_creditos_sistema))
        .nest("/api/telesalud", rutas_telesalud)
        .nest("/api/usuarios", rutas_usuarios)
        .nest("/api/lab/inventario", rutas_inventario)
        .nest("/api/lab/movimientos", rutas_movimientos)
        .nest("/api/lab/personal", rutas_personal) // <-- Módulo Personal
        .layer(cors)
        .with_state(state);


    let addr = SocketAddr::from(([0, 0, 0, 0], 4000));
    println!("🚀 Servidor Rust de alto rendimiento corriendo en http://172.16.10.240:4000");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}