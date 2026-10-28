⚡ SIGH RUST Core (v7.4) — Sistema de Información Hospitalaria de Alto Rendimiento
     
Núcleo transaccional asíncrono no bloqueante concebido para optimizar áreas críticas de interoperabilidad hospitalaria: Gestión Integral y Lotes Multi-FUA en Telesalud y el Control Logístico de Insumos y Reactivos de Laboratorio con Kárdex FEFO, enlazado de forma nativa al ERP hospitalario legacy (GalenHos / SIS-GalenPlus).

👨‍💻 Autoría y Propiedad Intelectual
Autor: Ing. Anhgelo Smith Vega Poma
Especialidad: Ingeniería de Sistemas y Computación
Colegiatura: Colegio de Ingenieros del Perú — CIP N° 381913 (Consejo Departamental Pasco)
Centro Hospitalario: Hospital Regional Daniel Alcides Carrión — Pasco | Unidad de Estadística e Informática (Data Center)
Licencia: Proprietary / View-Only License (Exclusivo para evaluación técnica institucional y portafolio profesional).

🏛️ Arquitectura Híbrida y Topología de Red
El sistema utiliza una arquitectura desacoplada donde el servidor web Apache actúa como host estático y punto de enlace simbólico (symlink) hacia el backend en Rust montado como microservicio systemd en el puerto 4000.
┌────────────────────────────────────────────────────────────────────────┐
│                        Cliente Web / Navegador                         │
│   Tailwind CSS (Lúcuma Theme) + Vanilla JS Asíncrono + SweetAlert2     │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ HTTP / REST / JSON
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Servidor Web Apache 2.4 (Reverse Proxy)               │
│               DocumentRoot: /var/www/html/sigh_rust (Symlink)          │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ Proxy Interno :4000
┌───────────────────────────────────▼────────────────────────────────────┐
│                       SIGH RUST Backend (Axum + Tokio)                 │
│         Middleware RBAC + State Compartido + TZ: America/Lima          │
└─────────────┬────────────────────────────────────────────┬─────────────┘
              │                                            │
              ▼ (Tiberius / TDS 7.3+)                      ▼ (SQLx Async Pool)
┌───────────────────────────────┐            ┌───────────────────────────┐
│  MS SQL Server (GalenHos)     │            │   PostgreSQL (Local)      │
│  Host: 192.168.32.123         │            │   Database: uei_sistemas  │
│  - SisFuaAtencion / Cuentas   │            │   - lab_insumos           │
│  - atencionesCE (Citas/Fechas)│            │   - lab_lotes (FEFO)      │
│  - dbo.telesalud (Multi-FUAs) │            │   - lab_movimientos       │
└───────────────────────────────┘            │   - lab_personal          │
                                             │   - usuarios_sigh         │
                                             └───────────────────────────┘

⚡ Módulos Funcionales
1. Módulo Telesalud (Gestión y Asignación de Correlativos FUA)
Matriz Cuádruple de FUAs: Permite registrar de manera atómica para una sola cuenta médica:
FuaNumeroEditado (FUA de Consulta Médica / Atención)
FuaFarmacia (Despacho de Medicamentos)
FuaLaboratorio (Exámenes de Laboratorio)
FuaImagenes (Diagnóstico por Imágenes / Rayos X)
Control de Rango y Lote Autorizado: Validación estricta del rango parametrizable (57000 a 60000) evitando saltos o duplicidades.
Correlativo Global Unificado: El motor calcula el siguiente FUA sugerido considerando simultáneamente las cuatro columnas de la base de datos para garantizar unicidad absoluta.
Integración Clínica GalenHos: Extracción automatizada de Cuenta, Historia Clínica, Médico Responsable, Servicio Hospitalario y Fecha/Hora exacta de cita desde dbo.SisFuaAtencion y dbo.atencionesCE.
2. Módulo de Laboratorio (Kárdex Analítico & Logística)
Despacho FEFO (First Expired, First Out): Al procesar una salida de reactivo, el sistema consume automáticamente el stock de los lotes con fecha de caducidad más próxima.
Eliminación Atómica en Cascada: Purga transaccional integral (lab_movimientos  lab_lotes  lab_insumos), garantizando que al eliminar un reactivo no queden ingresos huérfanos ni desfaces en el Kárdex.
Reversión Automática de Stock: Posibilidad de editar despachos o anular salidas reintegrando las cantidades de manera inmediata al lote de origen.
Directorio de Personal Receptor: CRUD para biólogos, tecnólogos y técnicos autorizados (lab_personal) con búsqueda predictiva por DNI o alias.
3. Seguridad y Redirección Basada en Roles (RBAC)
Aislamiento de Módulos: login.php enruta a los usuarios según su perfil:
LAB_RUST  Direccionado exclusivamente al catálogo de insumos (/views/insumos.html).
TELESALUD_RUST  Direccionado a la bandeja operativa de Telesalud (/views/dashboard.html).
ADMIN_RUST  Acceso total a configuraciones, personal, insumos y auditoría.
Zonificación Horaria Oficial: Configuración estricta en base de datos y serializadores bajo America/Lima (UTC-5) para auditorías legales y formatos SIS.

🛠️ Stack Tecnológico
Capa
Componente
Descripción
Backend Core
Rust (Edition 2024)
Lenguaje base compilado para máximo rendimiento y seguridad de memoria
Async Web Framework
Axum
Enrutador HTTP modular de alto rendimiento basado en Tower
Async Runtime
Tokio
Ejecutor asíncrono con hilos livianos y pooling no bloqueante
Persistencia Relacional
Tiberius & SQLx
Conectores asíncronos nativos para MS SQL Server y PostgreSQL
Frontend
Vanilla JS / Tailwind
Interfaz reactiva institucional con paleta Lúcuma / Oro Oscuro
UI Components
SweetAlert2 / FontAwesome 6
Notificaciones dinámicas y pack de iconografía médica y de bioanálisis


🚀 Instalación y Despliegue en Servidor
1. Variables de Entorno (.env)
Crear un archivo .env en la raíz del backend:
```env
PORT=4000
DATABASE_URL_AUTH=postgres://usuario:password@localhost:5432/system
MSSQL_HOST=192.168.1.1
MSSQL_PORT=1433
MSSQL_USER=usuario_sql
MSSQL_PASS=password_sql
MSSQL_DB=SIGH_EXTERNA
TZ=America/Lima
```

2. Compilación del Núcleo Rust
# Compilar binario optimizado para producción
cargo build --release

# Configurar o reiniciar el demonio systemd
sudo systemctl restart sigh-rust.service
sudo systemctl status sigh-rust.service
3. Configuración del Frontend con Apache
Crear el enlace simbólico hacia el repositorio en desarrollo:
sudo ln -s /home/user/proyectos/sigh_rust /var/www/html/sigh_rust
Asegurar permisos para el servidor web:
sudo chown -R www-data:www-data /home/user/proyectos/sigh_rust/public
sudo chmod -R 755 /home/user/proyectos/sigh_rust/public

📄 Licencia
Este software es propiedad intelectual del Ing. Anhgelo Smith Vega Poma (CIP 381913). Desarrollado para la Unidad de Estadística e Informática — Hospital Regional Daniel Alcides Carrión, Pasco, Perú. Queda prohibida su reproducción o distribución no autorizada.
