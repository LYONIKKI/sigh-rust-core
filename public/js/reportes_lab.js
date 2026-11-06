// public/js/reportes_lab.js

const API_REPORTES = "http://172.16.10.240:4000/api/lab/reportes";
const API_MOV = "http://172.16.10.240:4000/api/lab/movimientos";

let vistaActiva = "kardex";
let catalogoInsumos = [];
let insumoActivoKardex = null;

// Datos cargados en memoria
let datosKardex = [];
let datosSalidas = [];
let datosIngresos = [];
let datosValorizado = [];
let datosAreas = [];

// Estados de Paginación (de 10 en 10)
const filasPorPagina = 10;
const paginas = {
    kd: 1,
    sal: 1,
    ing: 1,
    val: 1
};

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "X-User-Role": "admin_rust"
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0];
    const ultimoDia = hoy.toISOString().split("T")[0];

    // Fechas iniciales
    ["kardex-desde", "sal-rep-desde", "ing-rep-desde"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = primerDia;
    });
    ["kardex-hasta", "sal-rep-hasta", "ing-rep-hasta"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = ultimoDia;
    });

    // Pestañas
    document.getElementById("tab-btn-kardex").addEventListener("click", () => cambiarVista("kardex"));
    document.getElementById("tab-btn-salidas").addEventListener("click", () => cambiarVista("salidas"));
    document.getElementById("tab-btn-ingresos").addEventListener("click", () => cambiarVista("ingresos"));
    document.getElementById("tab-btn-valorizado").addEventListener("click", () => cambiarVista("valorizado"));
    document.getElementById("tab-btn-areas").addEventListener("click", () => cambiarVista("areas"));

    // Eventos Kárdex
    document.getElementById("btn-filtrar-kardex").addEventListener("click", () => { paginas.kd = 1; cargarKardex(); });
    document.getElementById("kardex-desde").addEventListener("change", () => { paginas.kd = 1; cargarKardex(); });
    document.getElementById("kardex-hasta").addEventListener("change", () => { paginas.kd = 1; cargarKardex(); });
    document.getElementById("btn-kardex-todos").addEventListener("click", () => {
        document.getElementById("kardex-insumo-id").value = "0";
        document.getElementById("kardex-buscar-insumo").value = "";
        insumoActivoKardex = null;
        document.getElementById("kardex-titulo-detalle").innerText = "KÁRDEX CONSOLIDADO GLOBAL (TODOS LOS REACTIVOS)";
        paginas.kd = 1;
        cargarKardex();
    });

    // Eventos Salidas e Ingresos
    document.getElementById("btn-filtrar-salidas").addEventListener("click", () => { paginas.sal = 1; cargarReporteSalidas(); });
    document.getElementById("btn-filtrar-ingresos").addEventListener("click", () => { paginas.ing = 1; cargarReporteIngresos(); });

    // Botón Exportar Excel
    const btnExcel = document.getElementById("btn-exportar-excel");
    if (btnExcel) {
        btnExcel.addEventListener("click", exportarExcel);
    }

    // Inicialización progresiva
    await cargarCatalogoInsumos();
    configurarAutocompleteKardex();
    cargarKardex();
    cargarResumenValorizado(); // Carga y procesa tarjetas superiores de inmediato
});

function cambiarVista(vista) {
    vistaActiva = vista;
    const tabs = ["kardex", "salidas", "ingresos", "valorizado", "areas"];

    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const sec = document.getElementById(`seccion-${t}`);
        if (t === vista) {
            btn.className = "pb-3 border-b-2 border-amber-500 text-amber-700 flex items-center space-x-2 transition font-bold whitespace-nowrap";
            sec.classList.remove("hidden");
        } else {
            btn.className = "pb-3 border-b-2 border-transparent text-gray-400 hover:text-gray-700 flex items-center space-x-2 transition font-bold whitespace-nowrap";
            sec.classList.add("hidden");
        }
    });

    if (vista === "salidas" && datosSalidas.length === 0) cargarReporteSalidas();
    if (vista === "ingresos" && datosIngresos.length === 0) cargarReporteIngresos();
    if (vista === "valorizado") renderizarTablaValorizado();
    if (vista === "areas" && datosAreas.length === 0) cargarConsumoAreas();
}

/**
 * Función genérica de renderizado de controles de paginación
 */
function renderizarControlesPaginacion(prefix, totalItems, onPageChange) {
    const totalPaginas = Math.ceil(totalItems / filasPorPagina) || 1;
    let pag = paginas[prefix];
    if (pag > totalPaginas) pag = totalPaginas;
    if (pag < 1) pag = 1;
    paginas[prefix] = pag;

    const inicio = totalItems === 0 ? 0 : (pag - 1) * filasPorPagina + 1;
    const fin = Math.min(pag * filasPorPagina, totalItems);

    const info = document.getElementById(`${prefix}-info-paginacion`);
    if (info) info.innerText = `Mostrando ${inicio} - ${fin} de ${totalItems} registros`;

    const controles = document.getElementById(`${prefix}-controles-paginacion`);
    if (!controles) return;

    controles.innerHTML = `
        <button onclick="${onPageChange}(${pag - 1})" ${pag === 1 ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="px-3 py-1 font-bold text-gray-700 font-mono">${pag} / ${totalPaginas}</span>
        <button onclick="${onPageChange}(${pag + 1})" ${pag === totalPaginas ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;
}

async function cargarCatalogoInsumos() {
    try {
        const res = await fetch(`${API_MOV}/insumos/selector`, { headers: getHeaders() });
        const json = await res.json();
        if (json.status === "success") {
            catalogoInsumos = json.data;
        }
    } catch (_) {}
}

function configurarAutocompleteKardex() {
    const input = document.getElementById("kardex-buscar-insumo");
    const contenedor = document.getElementById("kardex-sugerencias-insumo");
    let indexSeleccionado = -1;

    function cerrar() {
        contenedor.classList.add("hidden");
        indexSeleccionado = -1;
    }

    input.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) { cerrar(); return; }

        const filtrados = catalogoInsumos.filter(i =>
            i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q)
        );

        if (filtrados.length === 0) {
            contenedor.innerHTML = `<div class="p-2.5 text-xs text-gray-400">Sin coincidencias</div>`;
            contenedor.classList.remove("hidden");
            return;
        }

        contenedor.innerHTML = filtrados.map((item, idx) => `
            <div class="item-kardex-sug p-2.5 hover:bg-amber-50 cursor-pointer border-b border-gray-100 text-xs transition" data-idx="${idx}">
                <p class="font-bold text-gray-900"><span class="font-mono text-amber-700">${item.codigo}</span> - ${item.descripcion}</p>
                <p class="text-[10px] text-gray-500 font-semibold">${item.presentacion} (${item.es_fraccionable ? item.determinaciones_por_empaque + ' DET' : 'UNIDAD'})</p>
            </div>
        `).join("");

        contenedor.querySelectorAll(".item-kardex-sug").forEach((el, idx) => {
            el.addEventListener("click", () => {
                insumoActivoKardex = filtrados[idx];
                document.getElementById("kardex-insumo-id").value = insumoActivoKardex.id;
                document.getElementById("kardex-buscar-insumo").value = `${insumoActivoKardex.codigo} - ${insumoActivoKardex.descripcion}`;
                document.getElementById("kardex-titulo-detalle").innerText = `KÁRDEX: [${insumoActivoKardex.codigo}] ${insumoActivoKardex.descripcion}`;
                cerrar();
                paginas.kd = 1;
                cargarKardex();
            });
        });

        contenedor.classList.remove("hidden");
        indexSeleccionado = -1;
    });

    input.addEventListener("keydown", (e) => {
        const divs = contenedor.querySelectorAll(".item-kardex-sug");
        if (contenedor.classList.contains("hidden") || divs.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            indexSeleccionado = (indexSeleccionado + 1) % divs.length;
            divs.forEach((d, i) => d.classList.toggle("autocomplete-active", i === indexSeleccionado));
            divs[indexSeleccionado].scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            indexSeleccionado = (indexSeleccionado - 1 + divs.length) % divs.length;
            divs.forEach((d, i) => d.classList.toggle("autocomplete-active", i === indexSeleccionado));
            divs[indexSeleccionado].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (indexSeleccionado >= 0 && indexSeleccionado < divs.length) {
                divs[indexSeleccionado].click();
            }
        } else if (e.key === "Escape") {
            cerrar();
        }
    });

    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !contenedor.contains(e.target)) cerrar();
    });
}

// 1. KÁRDEX CON PAGINACIÓN DE 10 EN 10
async function cargarKardex() {
    const insumoId = parseInt(document.getElementById("kardex-insumo-id").value || "0", 10);
    const desde = document.getElementById("kardex-desde").value;
    const hasta = document.getElementById("kardex-hasta").value;
    const tbody = document.getElementById("tabla-kardex-cuerpo");
    const footerResumen = document.getElementById("kardex-resumen-footer");

    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">Consultando movimientos...</td></tr>`;

    try {
        const res = await fetch(`${API_REPORTES}/kardex?insumo_id=${insumoId}&desde=${desde}&hasta=${hasta}`, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            datosKardex = json.data;
            document.getElementById("kardex-total-registros").innerText = `${datosKardex.length} movimientos`;

            if (datosKardex.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">No hay movimientos registrados en este rango de fechas.</td></tr>`;
                document.getElementById("kd-total-ingresos").innerText = "0";
                document.getElementById("kd-total-salidas").innerText = "0";
                document.getElementById("kd-saldo-final").innerText = "0";
                renderizarControlesPaginacion("kd", 0, "cambiarPaginaKardex");
                return;
            }

            let sumaIngresos = 0;
            let sumaSalidas = 0;
            let saldoFinal = 0;

            datosKardex.forEach((m, idx) => {
                if (m.tipo === "INGRESO") sumaIngresos += m.cantidad;
                if (m.tipo === "SALIDA") sumaSalidas += m.cantidad;
                if (idx === datosKardex.length - 1) saldoFinal = m.stock_posterior;
            });

            document.getElementById("kd-total-ingresos").innerText = sumaIngresos;
            document.getElementById("kd-total-salidas").innerText = sumaSalidas;
            document.getElementById("kd-saldo-final").innerText = saldoFinal;
            footerResumen.classList.remove("hidden");

            renderizarTablaKardex();
        }
    } catch (_) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-500">Error al consultar el kárdex.</td></tr>`;
    }
}

function renderizarTablaKardex() {
    const total = datosKardex.length;
    const pag = paginas.kd;
    const inicio = (pag - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = datosKardex.slice(inicio, fin);
    const tbody = document.getElementById("tabla-kardex-cuerpo");

    tbody.innerHTML = registros.map(m => {
        const badgeTipo = m.tipo === "INGRESO"
            ? `<span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-black text-[10px]">INGRESO</span>`
            : `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[10px]">SALIDA</span>`;

        const cantTxt = m.tipo_despacho === "FRACCION_DET"
            ? `<span class="text-purple-800 font-mono font-bold">${m.determinaciones_movidas} DET</span>`
            : `<span class="font-bold text-gray-800">${m.cantidad} UND</span>`;

        return `
            <tr class="hover:bg-amber-50/40 transition">
                <td class="py-2.5 px-4 font-mono font-bold text-gray-600">${m.fecha_hora}</td>
                <td class="py-2.5 px-4 text-center">${badgeTipo}</td>
                <td class="py-2.5 px-4 font-mono font-bold text-gray-700">${m.numero_lote}</td>
                <td class="py-2.5 px-4 text-gray-600">${m.tipo_despacho}</td>
                <td class="py-2.5 px-4 text-center">${cantTxt}</td>
                <td class="py-2.5 px-4 text-center font-mono text-gray-500">${m.stock_anterior}</td>
                <td class="py-2.5 px-4 text-center font-mono font-bold text-gray-900">${m.stock_posterior}</td>
                <td class="py-2.5 px-4 text-gray-700">${m.receptor} <span class="text-[10px] text-gray-400 block">${m.receptor_area}</span></td>
                <td class="py-2.5 px-4 font-mono text-[11px] text-gray-500">${m.despachador}</td>
            </tr>
        `;
    }).join("");

    renderizarControlesPaginacion("kd", total, "cambiarPaginaKardex");
}

window.cambiarPaginaKardex = function(p) {
    paginas.kd = p;
    renderizarTablaKardex();
};

// 2. SALIDAS CON PAGINACIÓN DE 10 EN 10
async function cargarReporteSalidas() {
    const desde = document.getElementById("sal-rep-desde").value;
    const hasta = document.getElementById("sal-rep-hasta").value;
    const q = document.getElementById("sal-rep-filtro").value.trim();
    const tbody = document.getElementById("tabla-salidas-cuerpo");

    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">Cargando salidas...</td></tr>`;

    try {
        const res = await fetch(`${API_MOV}/salidas?desde=${desde}&hasta=${hasta}&q=${encodeURIComponent(q)}`, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            datosSalidas = json.data;
            let sumaCant = 0;

            datosSalidas.forEach(s => sumaCant += s.cantidad);
            document.getElementById("sal-total-filas").innerText = datosSalidas.length;
            document.getElementById("sal-total-suma").innerText = sumaCant;

            if (datosSalidas.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">No hay salidas en este rango.</td></tr>`;
                renderizarControlesPaginacion("sal", 0, "cambiarPaginaSalidas");
                return;
            }

            renderizarTablaSalidas();
        }
    } catch (_) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-500">Error al cargar salidas.</td></tr>`;
    }
}

function renderizarTablaSalidas() {
    const total = datosSalidas.length;
    const pag = paginas.sal;
    const inicio = (pag - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = datosSalidas.slice(inicio, fin);
    const tbody = document.getElementById("tabla-salidas-cuerpo");

    tbody.innerHTML = registros.map(s => `
        <tr class="hover:bg-amber-50/40 transition">
            <td class="py-2.5 px-4 font-mono font-bold text-gray-600">${s.fecha_hora}</td>
            <td class="py-2.5 px-4 font-mono font-bold text-amber-700">${s.insumo_codigo}</td>
            <td class="py-2.5 px-4 font-semibold text-gray-900">${s.insumo_descripcion}</td>
            <td class="py-2.5 px-4 text-center font-black text-amber-700">${s.cantidad}</td>
            <td class="py-2.5 px-4 uppercase font-bold text-gray-800">${s.personal_nombre}</td>
            <td class="py-2.5 px-4 font-mono text-gray-600">${s.personal_dni}</td>
            <td class="py-2.5 px-4 text-gray-600">${s.personal_area}</td>
            <td class="py-2.5 px-4 text-gray-500">${s.personal_cargo}</td>
            <td class="py-2.5 px-4 font-mono text-[11px] text-gray-400 uppercase">${s.usuario_registro}</td>
        </tr>
    `).join("");

    renderizarControlesPaginacion("sal", total, "cambiarPaginaSalidas");
}

window.cambiarPaginaSalidas = function(p) {
    paginas.sal = p;
    renderizarTablaSalidas();
};

// 3. INGRESOS CON PAGINACIÓN DE 10 EN 10
async function cargarReporteIngresos() {
    const desde = document.getElementById("ing-rep-desde").value;
    const hasta = document.getElementById("ing-rep-hasta").value;
    const q = document.getElementById("ing-rep-filtro").value.trim();
    const tbody = document.getElementById("tabla-ingresos-cuerpo");

    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-400">Cargando ingresos...</td></tr>`;

    try {
        const res = await fetch(`${API_MOV}/ingresos?desde=${desde}&hasta=${hasta}&q=${encodeURIComponent(q)}`, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            datosIngresos = json.data;
            let sumaCant = 0;

            datosIngresos.forEach(i => sumaCant += i.cantidad);
            document.getElementById("ing-total-filas").innerText = datosIngresos.length;
            document.getElementById("ing-total-suma").innerText = sumaCant;

            if (datosIngresos.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-400">No hay remesas registradas en este rango.</td></tr>`;
                renderizarControlesPaginacion("ing", 0, "cambiarPaginaIngresos");
                return;
            }

            renderizarTablaIngresos();
        }
    } catch (_) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500">Error al cargar ingresos.</td></tr>`;
    }
}

function renderizarTablaIngresos() {
    const total = datosIngresos.length;
    const pag = paginas.ing;
    const inicio = (pag - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = datosIngresos.slice(inicio, fin);
    const tbody = document.getElementById("tabla-ingresos-cuerpo");

    tbody.innerHTML = registros.map(i => `
        <tr class="hover:bg-green-50/40 transition">
            <td class="py-2.5 px-4 font-mono font-bold text-gray-600">${i.fecha_registro}</td>
            <td class="py-2.5 px-4 font-mono font-bold text-green-700">${i.insumo_codigo}</td>
            <td class="py-2.5 px-4 font-semibold text-gray-900">${i.insumo_descripcion}</td>
            <td class="py-2.5 px-4 font-mono font-bold text-amber-900">${i.numero_lote}</td>
            <td class="py-2.5 px-4 text-center font-black text-green-800">${i.cantidad}</td>
            <td class="py-2.5 px-4 font-mono text-gray-600">${i.fecha_vencimiento || 'S/V'}</td>
            <td class="py-2.5 px-4 text-gray-600">${i.proveedor || '---'}</td>
            <td class="py-2.5 px-4 font-mono text-[11px] text-gray-400 uppercase">${i.usuario_registro}</td>
        </tr>
    `).join("");

    renderizarControlesPaginacion("ing", total, "cambiarPaginaIngresos");
}

window.cambiarPaginaIngresos = function(p) {
    paginas.ing = p;
    renderizarTablaIngresos();
};

// 4. INVENTARIO VALORIZADO CON PAGINACIÓN DE 10 EN 10
async function cargarResumenValorizado() {
    try {
        const res = await fetch(`${API_REPORTES}/valorizado`, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            datosValorizado = json.data;

            let totalSoles = 0;
            let criticos = 0;
            let frascosAbiertos = 0;

            datosValorizado.forEach(item => {
                totalSoles += item.valor_total_estimado;
                if (item.estado_alerta === "VENCIDO" || item.estado_alerta === "CRITICO") criticos++;
                if (item.determinaciones_abiertas > 0) frascosAbiertos++;
            });

            document.getElementById("card-valor-total").innerText = `S/ ${totalSoles.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById("card-vencimientos-criticos").innerText = criticos;
            document.getElementById("card-frascos-abiertos").innerText = frascosAbiertos;

            renderizarTablaValorizado();
        }
    } catch (_) {}
}

function renderizarTablaValorizado() {
    const total = datosValorizado.length;
    const tbody = document.getElementById("tabla-valorizado-cuerpo");

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">Sin datos valorizados.</td></tr>`;
        renderizarControlesPaginacion("val", 0, "cambiarPaginaValorizado");
        return;
    }

    const pag = paginas.val;
    const inicio = (pag - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = datosValorizado.slice(inicio, fin);

    tbody.innerHTML = registros.map(item => {
        let badgeAlerta = `<span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-bold text-[10px]">ÓPTIMO</span>`;
        if (item.estado_alerta === "VENCIDO") {
            badgeAlerta = `<span class="px-2 py-0.5 rounded bg-red-600 text-white font-bold text-[10px] animate-pulse">VENCIDO</span>`;
        } else if (item.estado_alerta === "CRITICO") {
            badgeAlerta = `<span class="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">≤ 30 DÍAS</span>`;
        } else if (item.estado_alerta === "PROXIMO") {
            badgeAlerta = `<span class="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-bold text-[10px]">≤ 90 DÍAS</span>`;
        }

        return `
            <tr class="hover:bg-amber-50/40 transition">
                <td class="py-2.5 px-4 font-mono font-bold text-gray-600">${item.codigo}</td>
                <td class="py-2.5 px-4 font-semibold text-gray-900">${item.descripcion}</td>
                <td class="py-2.5 px-4 text-gray-600">${item.ubicacion}</td>
                <td class="py-2.5 px-4 text-center font-bold font-mono text-gray-800">${item.empaques_sellados}</td>
                <td class="py-2.5 px-4 text-center font-mono font-bold text-purple-800">${item.determinaciones_abiertas > 0 ? item.determinaciones_abiertas + ' det.' : '---'}</td>
                <td class="py-2.5 px-4 text-right font-mono text-gray-600">S/ ${item.valor_unitario.toFixed(2)}</td>
                <td class="py-2.5 px-4 text-right font-mono font-bold text-amber-700">S/ ${item.valor_total_estimado.toFixed(2)}</td>
                <td class="py-2.5 px-4 font-mono text-[11px] text-gray-600">${item.proximo_vencimiento || 'S/V'}</td>
                <td class="py-2.5 px-4 text-center">${badgeAlerta}</td>
            </tr>
        `;
    }).join("");

    renderizarControlesPaginacion("val", total, "cambiarPaginaValorizado");
}

window.cambiarPaginaValorizado = function(p) {
    paginas.val = p;
    renderizarTablaValorizado();
};

// 5. CONSUMO POR ÁREAS
async function cargarConsumoAreas() {
    const tbody = document.getElementById("tabla-areas-cuerpo");
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-gray-400">Calculando consumo...</td></tr>`;

    try {
        const res = await fetch(`${API_REPORTES}/consumo-area`, { headers: getHeaders() });
        const json = await res.json();
        if (json.status === "success") {
            datosAreas = json.data;
            tbody.innerHTML = datosAreas.map(a => `
                <tr class="hover:bg-amber-50/40 transition">
                    <td class="py-3 px-4 font-bold text-gray-900">${a.area}</td>
                    <td class="py-3 px-4 text-center font-mono font-black text-amber-700">${a.total_despachos}</td>
                    <td class="py-3 px-4 text-center font-mono font-bold text-gray-800">${a.total_empaques}</td>
                    <td class="py-3 px-4 text-center font-mono font-bold text-purple-800">${a.total_determinaciones}</td>
                </tr>
            `).join("");
        }
    } catch (_) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-red-500">Error al calcular áreas.</td></tr>`;
    }
}

// EXPORTACIÓN A EXCEL (.XLSX) PROFESIONAL
function exportarExcel() {
    if (typeof XLSX === "undefined") {
        Swal.fire({ icon: "error", title: "Error", text: "La librería SheetJS no está cargada.", confirmButtonColor: "#d97706" });
        return;
    }

    let wb = XLSX.utils.book_new();

    if (vistaActiva === "kardex") {
        if (!datosKardex || datosKardex.length === 0) {
            Swal.fire({ icon: "warning", title: "Atención", text: "No hay movimientos para exportar en Kárdex.", confirmButtonColor: "#d97706" });
            return;
        }

        const tituloInsumo = insumoActivoKardex 
            ? `REACTIVO: [${insumoActivoKardex.codigo}] ${insumoActivoKardex.descripcion}`
            : "REPORTE GENERAL: TODOS LOS REACTIVOS Y MOVIMIENTOS";

        const fDesde = document.getElementById("kardex-desde").value;
        const fHasta = document.getElementById("kardex-hasta").value;

        let sumaIng = 0, sumaSal = 0, saldoFin = 0;
        const wsData = [
            ["HOSPITAL REGIONAL DANIEL ALCIDES CARRIÓN - PASCO"],
            ["REPORTE OFICIAL DE KÁRDEX Y AUDITORÍA DE MOVIMIENTOS"],
            [tituloInsumo],
            [`PERIODO EVALUADO: DEL ${fDesde} AL ${fHasta}`],
            [],
            ["FECHA Y HORA", "TIPO", "N° LOTE", "MODALIDAD", "CANTIDAD", "STOCK ANTERIOR", "STOCK FINAL", "PERSONAL RECEPTOR", "ÁREA DESTINO", "USUARIO REGISTRO"]
        ];

        datosKardex.forEach((m, idx) => {
            if (m.tipo === "INGRESO") sumaIng += m.cantidad;
            if (m.tipo === "SALIDA") sumaSal += m.cantidad;
            if (idx === datosKardex.length - 1) saldoFin = m.stock_posterior;

            const cantTxt = m.tipo_despacho === "FRACCION_DET" ? `${m.determinaciones_movidas} DET` : `${m.cantidad} UND`;
            wsData.push([m.fecha_hora, m.tipo, m.numero_lote, m.tipo_despacho, cantTxt, m.stock_anterior, m.stock_posterior, m.receptor, m.receptor_area, m.despachador]);
        });

        wsData.push([]);
        wsData.push(["RESUMEN DE TOTALES", "", "", "", "", "", "", "", "", ""]);
        wsData.push(["TOTAL ENTRADAS / INGRESOS:", sumaIng, "", "", "", "", "", "", "", ""]);
        wsData.push(["TOTAL SALIDAS / DESPACHOS:", sumaSal, "", "", "", "", "", "", "", ""]);
        wsData.push(["SALDO REGISTRADO EN EXISTENCIA:", saldoFin, "", "", "", "", "", "", "", ""]);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [{ wch: 19 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 32 }, { wch: 25 }, { wch: 28 }];
        XLSX.utils.book_append_sheet(wb, ws, "Kardex");
        const nombreArchivo = insumoActivoKardex ? `Kardex_${insumoActivoKardex.codigo}_${fDesde}_al_${fHasta}.xlsx` : `Kardex_General_${fDesde}_al_${fHasta}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);

    } else if (vistaActiva === "salidas") {
        if (!datosSalidas || datosSalidas.length === 0) {
            Swal.fire({ icon: "warning", title: "Atención", text: "No hay salidas para exportar.", confirmButtonColor: "#d97706" });
            return;
        }

        const fDesde = document.getElementById("sal-rep-desde").value;
        const fHasta = document.getElementById("sal-rep-hasta").value;

        let totalSuma = 0;
        const wsData = [
            ["HOSPITAL REGIONAL DANIEL ALCIDES CARRIÓN - PASCO"],
            ["REPORTE GENERAL DE SALIDAS Y DESPACHOS DE LABORATORIO"],
            [`PERIODO: DEL ${fDesde} AL ${fHasta}`],
            [],
            ["FECHA Y HORA", "CÓDIGO", "INSUMO DESPACHADO", "CANTIDAD", "PERSONAL RECEPTOR", "DNI", "ÁREA DESTINO", "CARGO", "DESPACHADOR"]
        ];

        datosSalidas.forEach(s => {
            totalSuma += s.cantidad;
            wsData.push([s.fecha_hora, s.insumo_codigo, s.insumo_descripcion, s.cantidad, s.personal_nombre, s.personal_dni, s.personal_area, s.personal_cargo, s.usuario_registro]);
        });

        wsData.push([]);
        wsData.push(["TOTAL UNIDADES DESPACHADAS:", "", "", totalSuma]);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [{ wch: 19 }, { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws, "Salidas");
        XLSX.writeFile(wb, `Reporte_Salidas_${fDesde}_al_${fHasta}.xlsx`);

    } else if (vistaActiva === "ingresos") {
        if (!datosIngresos || datosIngresos.length === 0) {
            Swal.fire({ icon: "warning", title: "Atención", text: "No hay remesas para exportar.", confirmButtonColor: "#d97706" });
            return;
        }

        const fDesde = document.getElementById("ing-rep-desde").value;
        const fHasta = document.getElementById("ing-rep-hasta").value;

        let totalSuma = 0;
        const wsData = [
            ["HOSPITAL REGIONAL DANIEL ALCIDES CARRIÓN - PASCO"],
            ["REPORTE GENERAL DE INGRESOS Y REMESAS DE LABORATORIO"],
            [`PERIODO: DEL ${fDesde} AL ${fHasta}`],
            [],
            ["FECHA INGRESO", "CÓDIGO", "INSUMO", "N° LOTE", "CANTIDAD", "F. VENCIMIENTO", "PROVEEDOR", "RECIBIDO POR"]
        ];

        datosIngresos.forEach(i => {
            totalSuma += i.cantidad;
            wsData.push([i.fecha_registro, i.insumo_codigo, i.insumo_descripcion, i.numero_lote, i.cantidad, i.fecha_vencimiento || 'S/V', i.proveedor || '---', i.usuario_registro]);
        });

        wsData.push([]);
        wsData.push(["TOTAL EMPAQUES INGRESADOS:", "", "", "", totalSuma]);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [{ wch: 19 }, { wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 14 }, { wch: 15 }, { wch: 24 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws, "Ingresos");
        XLSX.writeFile(wb, `Reporte_Ingresos_${fDesde}_al_${fHasta}.xlsx`);

    } else if (vistaActiva === "valorizado") {
        if (!datosValorizado || datosValorizado.length === 0) {
            Swal.fire({ icon: "info", title: "Aviso", text: "No hay datos de inventario para exportar.", confirmButtonColor: "#d97706" });
            return;
        }

        let sumaValor = 0;
        const wsData = [
            ["HOSPITAL REGIONAL DANIEL ALCIDES CARRIÓN - PASCO"],
            ["INVENTARIO FÍSICO VALORIZADO Y CONTROL DE VENCIMIENTOS"],
            [],
            ["CÓDIGO", "DESCRIPCIÓN DEL INSUMO", "UBICACIÓN", "EMPAQUES SELLADOS", "DET. ABIERTAS", "COSTO UNITARIO (S/)", "VALOR TOTAL (S/)", "PRÓX. VENCIMIENTO", "ESTADO"]
        ];

        datosValorizado.forEach(i => {
            sumaValor += i.valor_total_estimado;
            wsData.push([
                i.codigo,
                i.descripcion,
                i.ubicacion,
                i.empaques_sellados,
                i.determinaciones_abiertas > 0 ? i.determinaciones_abiertas : 0,
                i.valor_unitario,
                i.valor_total_estimado,
                i.proximo_vencimiento || "S/V",
                i.estado_alerta
            ]);
        });

        wsData.push([]);
        wsData.push(["VALOR TOTAL EN ALMACÉN (S/):", "", "", "", "", "", sumaValor]);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, "Inventario_Valorizado");
        XLSX.writeFile(wb, `Inventario_Valorizado_${new Date().toISOString().split("T")[0]}.xlsx`);

    } else {
        if (!datosAreas || datosAreas.length === 0) {
            Swal.fire({ icon: "info", title: "Aviso", text: "No hay datos de áreas para exportar.", confirmButtonColor: "#d97706" });
            return;
        }

        const wsData = [
            ["HOSPITAL REGIONAL DANIEL ALCIDES CARRIÓN - PASCO"],
            ["CONSUMO CONSOLIDADO POR SERVICIO / ÁREA HOSPITALARIA"],
            [],
            ["ÁREA DESTINO", "TOTAL DESPACHOS", "EMPAQUES SELLADOS", "DETERMINACIONES SUELTAS"]
        ];

        datosAreas.forEach(a => {
            wsData.push([a.area, a.total_despachos, a.total_empaques, a.total_determinaciones]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(wb, ws, "Consumo_Areas");
        XLSX.writeFile(wb, `Consumo_Areas_${new Date().toISOString().split("T")[0]}.xlsx`);
    }
}