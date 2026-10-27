-- 1. Tabla de Catálogo de Personal Receptor (Datos migrados de la hoja BDATOS)
CREATE TABLE IF NOT EXISTS public.lab_personal (
    id SERIAL PRIMARY KEY,
    dni VARCHAR(15) NOT NULL UNIQUE,
    nombres VARCHAR(200) NOT NULL,
    area VARCHAR(100) NOT NULL,       -- 'LABORATORIO CENTRAL', 'BANCO DE SANGRE', 'ANATOMIA PATOLOGICA'
    cargo VARCHAR(100) NOT NULL,      -- 'TECNICO EN LABORATORIO', 'BIOLOGO', 'TECNOLOGO MEDICO', etc.
    alias VARCHAR(50),                -- 'MARIA', 'YASER', 'ADELAIDA', etc.
    estado SMALLINT DEFAULT 1,
    creado_en TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla Maestra de Insumos / Reactivos
CREATE TABLE IF NOT EXISTS public.lab_insumos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,      -- '29116', '39039-01', 'RTV100'
    descripcion TEXT NOT NULL,               -- 'ASO LATEX X 50 DET'
    ubicacion VARCHAR(100) NOT NULL,         -- 'BIOQUIMICA', 'HEMATOLOGIA', 'MICROBIOLOGIA'
    valor_unitario NUMERIC(10,2) DEFAULT 0.00,
    proveedor VARCHAR(150),                  -- 'BIOANALITICA', 'WIENER LAB', 'DISTPROLAB'
    stock_minimo INT DEFAULT 2,              -- Umbral para semáforo rojo / amarillo
    estado_insumo VARCHAR(20) DEFAULT 'VIGENTE', -- 'VIGENTE', 'AGOTADO'
    alias_registro VARCHAR(50) DEFAULT 'DLC',
    estado SMALLINT DEFAULT 1,               -- 1: Activo, 0: Eliminado lógico
    creado_en TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla de Lotes y Vencimientos
CREATE TABLE IF NOT EXISTS public.lab_lotes (
    id SERIAL PRIMARY KEY,
    insumo_id INT NOT NULL REFERENCES public.lab_insumos(id) ON DELETE RESTRICT,
    numero_lote VARCHAR(100) NOT NULL,       -- 'LOTE-XXXX' o 'HIST-20250114'
    fecha_ingreso DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE NULL,             -- Permite NULL si era 00/00/0000
    stock_actual INT NOT NULL DEFAULT 0,
    estado_lote VARCHAR(20) DEFAULT 'VIGENTE',
    creado_en TIMESTAMP DEFAULT NOW()
);

-- 4. Kárdex de Movimientos (Auditoría de Ingresos y Salidas)
CREATE TABLE IF NOT EXISTS public.lab_movimientos (
    id BIGSERIAL PRIMARY KEY,
    insumo_id INT NOT NULL REFERENCES public.lab_insumos(id),
    lote_id INT NULL REFERENCES public.lab_lotes(id),
    tipo VARCHAR(10) NOT NULL,               -- 'INGRESO' o 'SALIDA'
    cantidad INT NOT NULL,
    stock_anterior INT NOT NULL,
    stock_posterior INT NOT NULL,
    -- Datos del receptor (para salidas)
    personal_dni VARCHAR(15),
    personal_nombre VARCHAR(200),
    personal_area VARCHAR(100),
    personal_cargo VARCHAR(100),
    -- Datos del usuario SIGH Rust que procesó la transacción
    usuario_registro VARCHAR(50) NOT NULL,
    fecha_registro TIMESTAMP DEFAULT NOW()
);

-- databasepg/schema.sql
-- Estructura de base de datos PostgreSQL para ACL / Sesiones Laboratorio

CREATE TABLE IF NOT EXISTS medicos_informantes (
    id_medico SERIAL PRIMARY KEY,
    nombres VARCHAR(150) NOT NULL,
    cmp VARCHAR(20),
    rne VARCHAR(20),
    estado INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS usuarios_sigh (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nombre VARCHAR(150),
    rol VARCHAR(20) DEFAULT 'admin',
    estado INTEGER DEFAULT 1,
    slug_destino VARCHAR(50),
    id_medico_asociado INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usuarios_sigh_id_medico_asociado_fkey 
        FOREIGN KEY (id_medico_asociado) 
        REFERENCES medicos_informantes(id_medico) 
        ON DELETE SET NULL
);

-- Índices adicionales para autenticación rápida
CREATE INDEX IF NOT EXISTS idx_usuarios_sigh_usuario ON usuarios_sigh(usuario);
CREATE INDEX IF NOT EXISTS idx_usuarios_sigh_estado ON usuarios_sigh(estado);

-- Usuario inicial administrador por defecto (password: admin123 hash o texto según tu lógica)
-- Reemplazar el hash con el algoritmo usado (BCRYPT / SHA)
INSERT INTO usuarios_sigh (usuario, password, nombre, rol, estado, slug_destino)
VALUES ('admin', '$2y$10$YourHashedPasswordHere', 'ADMINISTRADOR SISTEMA', 'admin', 1, 'laboratorio')
ON CONFLICT (usuario) DO NOTHING;