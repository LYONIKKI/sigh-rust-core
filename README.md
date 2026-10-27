# ⚡ SIGH RUST Core - Módulo de Alto Rendimiento: Telesalud & Logística de Insumos

Módulo transaccional de alta concurrencia desarrollado en **Rust** (Axum + Tokio), concebido para optimizar procesos críticos de facturación médica (**Telesalud / FUAs fuera de lote**) y control de inventario analítico (**Insumos de Laboratorio**), interoperando de forma nativa con el ERP hospitalario legacy (**SIGH / SIS-GalenPlus**).

---

## 👨‍💻 Autoría y Propiedad Intelectual

* **Autor:** Ing. Anhgelo Smith Vega Poma
* **Especialidad:** Ingeniería de Sistemas y Computación
* **Colegiatura:** Colegio de Ingenieros del Perú — **CIP N° 381913** (Sede Pasco)
* **Licencia:** *Proprietary / View-Only License* (Exclusivo para evaluación técnica y portafolio profesional).

---

## 🏛️ Arquitectura del Sistema y Persistencia Híbrida

El núcleo implementa un diseño asíncrono no bloqueante con Tokio y Axum, desacoplando la gestión de seguridad y lógica local frente al motor transaccional SQL Server central:

┌────────────────────────────────────────────────────────┐
│             UI / Frontend (SPA Administrativa)         │
│   Tailwind CSS + Vanilla JS AJAX + Modales Reactivos   │
└───────────────────────────▲────────────────────────────┘
│ HTTP / REST / JSON (Puerto 3000 o Proxy Apache)
┌───────────────────────────▼────────────────────────────┐
│             Backend Asíncrono en Rust (Axum)           │
│   Rutas Modulares + Middleware RBAC + State Compartido │
└─────────────┬────────────────────────────┬─────────────┘
│                            │
▼ (Tiberius / TDS 7.3+)      ▼ (SQLx / Pool Async)
┌──────────────────────────┐  ┌──────────────────────────┐
│   SQL Server (SIGH)      │  │   PostgreSQL (Local)     │
│   Persistencia Clínica   │  │   Control Operativo      │
│   - Atenciones y Cuentas │  │   - Auditoría de FUAs    │
│   - Médicos / Servicios  │  │   - Rango de Lotes Tele  │
│   - FUA Centralizado     │  │   - Stock y Kárdex Insumo│
└──────────────────────────┘  └──────────────────────────┘

### 1. Conexión SQL Server Legacy sin TLS Obligatorio (`Tiberius`)
* Implementación de clientes TCP directos compatibles con versiones antiguas de SQL Server donde la negociación TLS/SSL no está habilitada institucionalmente (`EncryptionLevel::NotSupported`).
* Manejo de sockets no bloqueantes mediante `tokio_util::compat` y protección de concurrencia a través de `Arc<Mutex<Client>>`.

### 2. Capa Operativa Local (`SQLx` + PostgreSQL)
* Pool asíncrono de alto desempeño para registrar auditorías de asignación en milisegundos sin sobrecargar la base de datos principal del hospital.
* Control estricto de roles administrativos (`ADMIN_RUST`, `TELESALUD_RUST`, `LAB_RUST`).

---

## ⚡ Módulos y Capacidades del Sistema

### 1. Módulo Telesalud (Control de Lotes y FUAs Fuera de Lote)
* **Asignación Secuencial Automatizada:** Numeración y control de correlativos autorizados para atenciones virtuales y teleinterconsultas (rango parametrizable, ej. 57000 - 60000).
* **Bandeja de Auditoría en Tiempo Real:** Visualización instantánea de atenciones procesadas por turno, correlacionando cuenta hospitalaria, DNI, paciente, médico tratante y usuario registrador.
* **Integridad Transaccional:** Prevención de duplicidad de códigos FUA mediante restricciones únicas e indexación btree.

### 2. Módulo de Insumos de Laboratorio
* **Kárdex y Control de Stock:** Registro de ingresos, salidas y mermas operativas por reactivo y material de laboratorio.
* **Trazabilidad de Despacho:** Vinculación directa con el personal técnico receptor y cálculo automático de existencias mínimas.

---

## 🛠️ Stack Tecnológico

* **Lenguaje:** Rust 2024
* **Framework Web:** Axum 0.1.0
* **Runtime Asíncrono:** Tokio 1.54.0
* **Drivers de Persistencia:** 
  * `tiberius` (Protocolo TDS nativo para Microsoft SQL Server)
  * `sqlx` (PostgreSQL async con soporte pool y prepared statements)
* **Serialización:** `serde` / `serde_json`
* **Frontend:** HTML5, CSS (Tailwind local), JavaScript Vanilla (AJAX asíncrono)
* **Servidor Web y Enlace:** Apache 2.4 (VirtualHost con `FollowSymLinks`)

---

## 🚀 Despliegue Local y Ejecución

1. **Clonar el repositorio:**
   ```bash
   git clone [https://github.com/LYONIKKI/sigh-rust-core.git](https://github.com/LYONIKKI/sigh-rust-core.git)
   cd sigh-rust-core