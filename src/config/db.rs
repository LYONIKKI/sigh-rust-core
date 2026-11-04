use sqlx::PgPool;
use tiberius::{Client, Config, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use dotenvy::dotenv;
use std::env;
use std::sync::Arc;
use tokio::sync::Mutex;

pub type SqlClient = Client<Compat<TcpStream>>;

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub db_auth: PgPool,
    pub db_sql: Arc<Mutex<SqlClient>>,
    pub sql_config: Config,
    pub sql_addr: (String, u16),
}

impl AppState {
    /// Obtiene el cliente bloqueado; si la conexión se cayó (BrokenPipe), se reconecta automáticamente
    pub async fn get_sql_client(&self) -> tokio::sync::MutexGuard<'_, SqlClient> {
        let mut client = self.db_sql.lock().await;
        
        // Verificación rápida: si la conexión falló o se cerró, reabrimos el socket
        if client.simple_query("SELECT 1;").await.is_err() {
            eprintln!("⚠️ Conexión con SQL Server perdida. Reconectando socket TCP...");
            if let Ok(tcp) = TcpStream::connect(format!("{}:{}", self.sql_addr.0, self.sql_addr.1)).await {
                let _ = tcp.set_nodelay(true);
                if let Ok(new_client) = Client::connect(self.sql_config.clone(), tcp.compat_write()).await {
                    *client = new_client;
                    println!("✅ Reconexión con SQL Server exitosa.");
                }
            }
        }
        client
    }
}

pub async fn init_databases() -> AppState {
    dotenv().ok();

    // 1. PostgreSQL (Pool nativo de sqlx)
    let pg_host = env::var("DB_PG_HOST").unwrap_or_else(|_| "localhost".into());
    let pg_port = env::var("DB_PG_PORT").unwrap_or_else(|_| "5432".into());
    let pg_db   = env::var("DB_PG_DATABASE").expect("DB_PG_DATABASE no configurada en .env");
    let pg_user = env::var("DB_PG_USER").expect("DB_PG_USER no configurada en .env");
    let pg_pass = env::var("DB_PG_PASS").expect("DB_PG_PASS no configurada en .env");

    let pg_url = format!("postgres://{}:{}@{}:{}/{}", pg_user, pg_pass, pg_host, pg_port, pg_db);
    let pool_pg = PgPool::connect(&pg_url)
        .await
        .expect("Error crítico al conectar al pool de PostgreSQL");

    // 2. SQL Server (Configuración y primer handshake)
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
    config.encryption(EncryptionLevel::NotSupported);
    config.trust_cert();

    let tcp = TcpStream::connect(format!("{}:{}", sql_host, sql_port))
        .await
        .expect("Error al conectar socket TCP con SQL Server");
    tcp.set_nodelay(true).unwrap();

    let client = Client::connect(config.clone(), tcp.compat_write())
        .await
        .expect("Error al autenticar sesión inicial con SQL Server");

    AppState {
        db_auth: pool_pg,
        db_sql: Arc::new(Mutex::new(client)),
        sql_config: config,
        sql_addr: (sql_host, sql_port),
    }
}