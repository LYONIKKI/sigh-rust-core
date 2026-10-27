use sqlx::PgPool;
use tiberius::{Client, Config, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use dotenvy::dotenv;
use std::env;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub db_auth: PgPool,
    pub db_sql: Arc<tokio::sync::Mutex<Client<tokio_util::compat::Compat<TcpStream>>>>,
}

pub async fn init_databases() -> AppState {
    dotenv().ok();

    // 1. Conexión PostgreSQL (Autenticación / ACL / Insumos)
    let pg_host = env::var("DB_PG_HOST").unwrap_or_else(|_| "localhost".into());
    let pg_port = env::var("DB_PG_PORT").unwrap_or_else(|_| "5432".into());
    let pg_db   = env::var("DB_PG_DATABASE").expect("DB_PG_DATABASE no configurada en .env");
    let pg_user = env::var("DB_PG_USER").expect("DB_PG_USER no configurada en .env");
    let pg_pass = env::var("DB_PG_PASS").expect("DB_PG_PASS no configurada en .env");

    let pg_url = format!("postgres://{}:{}@{}:{}/{}", pg_user, pg_pass, pg_host, pg_port, pg_db);
    let pool_pg = PgPool::connect(&pg_url)
        .await
        .expect("Error crítico al conectar al pool de PostgreSQL");

    // 2. Conexión SQL Server (SIGH / Interoperabilidad Clínica)
    let sql_host = env::var("DB_SQL_HOST").expect("DB_SQL_HOST no configurada en .env");
    let sql_port: u16 = env::var("DB_SQL_PORT")
        .unwrap_or_else(|_| "1433".into())
        .parse()
        .unwrap_or(1433);
    let sql_db   = env::var("DB_SQL_DATABASE").expect("DB_SQL_DATABASE no configurada en .env");
    let sql_user = env::var("DB_SQL_USER").expect("DB_SQL_USER no configurada en .env");
    let sql_pass = env::var("DB_SQL_PASS").expect("DB_SQL_PASS no configurada en .env");

    let mut config = Config::new();
    config.host(&sql_host);
    config.port(sql_port);
    config.database(&sql_db);
    config.authentication(tiberius::AuthMethod::sql_server(&sql_user, &sql_pass));

    // Compatibilidad para instancias legacy sin TLS obligatorio
    config.encryption(EncryptionLevel::NotSupported);
    config.trust_cert();

    let tcp = TcpStream::connect(format!("{}:{}", sql_host, sql_port))
        .await
        .expect("Error: No se pudo conectar al socket TCP de SQL Server (puerto 1433)");
    
    tcp.set_nodelay(true).unwrap();

    let client = Client::connect(config, tcp.compat_write())
        .await
        .expect("Error crítico al autenticar la sesión con SQL Server");

    AppState {
        db_auth: pool_pg,
        db_sql: Arc::new(tokio::sync::Mutex::new(client)),
    }
}