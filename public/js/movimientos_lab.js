// public/js/movimientos_lab.js

const API_MOV = "http://172.16.10.240:4000/api/lab/movimientos";
let usuarioSesion = "ADMINISTRADOR RUST";
let rolSesion = "admin_rust";

let pestanaActiva = "salidas";
let listaMovimientos = [];
let listaFiltrada = [];
let paginaActual = 1;
const filasPorPagina = 12;

let catalogoInsumos = [];
let personalSeleccionado = null;
let editPersonalSeleccionado = null;

const modalSalida = document.getElementById("modal-salida");
const modalIngreso = document.getElementById("modal-ingreso");
const modalEditarSalida = document.getElementById("modal-editar-salida");

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "X-User-Role": rolSesion
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const resp = await fetch("/sigh_rust/public/session_info.php");
        if (resp.ok) {
            const sess = await resp.json();
            if (sess && sess.usuario) usuarioSesion = sess.usuario.toUpperCase();
            if (sess && sess.rol) rolSesion = sess.rol.toLowerCase().trim();
        }
    } catch (_) {}

    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0];
    const ultimoDia = hoy.toISOString().split("T")[0];
    document.getElementById("filtro-desde").value = primerDia;
    document.getElementById("filtro-hasta").value = ultimoDia;

    // Tabs
    document.getElementById("tab-btn-salidas").addEventListener("click", () => alternarTab("salidas"));
    document.getElementById("tab-btn-ingresos").addEventListener("click", () => alternarTab("ingresos"));

    // Modal Salida
    document.getElementById("btn-abrir-salida").addEventListener("click", abrirModalSalida);
    document.getElementById("btn-cerrar-salida").addEventListener("click", () => modalSalida.classList.remove("active"));
    document.getElementById("btn-cancelar-salida").addEventListener("click", () => modalSalida.classList.remove("active"));
    document.getElementById("btn-guardar-salida").addEventListener("click", guardarSalida);

    // Modal Ingreso
    document.getElementById("btn-abrir-ingreso").addEventListener("click", abrirModalIngreso);
    document.getElementById("btn-cerrar-ingreso").addEventListener("click", () => modalIngreso.classList.remove("active"));
    document.getElementById("btn-cancelar-ingreso").addEventListener("click", () => modalIngreso.classList.remove("active"));
    document.getElementById("btn-guardar-ingreso").addEventListener("click", guardarIngreso);

    // Modal Editar Salida
    document.getElementById("btn-cerrar-editar-salida").addEventListener("click", () => modalEditarSalida.classList.remove("active"));
    document.getElementById("btn-cancelar-editar-salida").addEventListener("click", () => modalEditarSalida.classList.remove("active"));
    document.getElementById("btn-guardar-editar-salida").addEventListener("click", guardarEdicionSalida);

    // Filtros
    document.getElementById("btn-filtrar").addEventListener("click", cargarBandeja);
    document.getElementById("btn-limpiar-filtro").addEventListener("click", () => {
        document.getElementById("filtro-texto").value = "";
        document.getElementById("filtro-desde").value = primerDia;
        document.getElementById("filtro-hasta").value = ultimoDia;
        cargarBandeja();
    });

    document.getElementById("filtro-texto").addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        listaFiltrada = listaMovimientos.filter(item => JSON.stringify(item).toLowerCase().includes(q));
        paginaActual = 1;
        renderizarTabla();
    });

    await cargarSelectorInsumos();
    configurarBuscadorPersonal();
    configurarBuscadorPersonalEdit();
    cargarBandeja();
});

function alternarTab(tab) {
    pestanaActiva = tab;
    const btnSal = document.getElementById("tab-btn-salidas");
    const btnIng = document.getElementById("tab-btn-ingresos");
    const secSal = document.getElementById("seccion-salidas");
    const secIng = document.getElementById("seccion-ingresos");

    if (tab === "salidas") {
        btnSal.className = "pb-3 border-b-2 border-amber-500 text-amber-700 flex items-center space-x-2 transition font-bold";
        btnIng.className = "pb-3 border-b-2 border-transparent text-gray-400 hover:text-gray-700 flex items-center space-x-2 transition font-bold";
        secSal.classList.remove("hidden");
        secIng.classList.add("hidden");
    } else {
        btnIng.className = "pb-3 border-b-2 border-amber-500 text-amber-700 flex items-center space-x-2 transition font-bold";
        btnSal.className = "pb-3 border-b-2 border-transparent text-gray-400 hover:text-gray-700 flex items-center space-x-2 transition font-bold";
        secIng.classList.remove("hidden");
        secSal.classList.add("hidden");
    }
    cargarBandeja();
}

async function cargarBandeja() {
    const desde = document.getElementById("filtro-desde").value;
    const hasta = document.getElementById("filtro-hasta").value;
    const q = document.getElementById("filtro-texto").value.trim();

    const url = `${API_MOV}/${pestanaActiva}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&q=${encodeURIComponent(q)}`;

    try {
        const res = await fetch(url, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            listaMovimientos = json.data;
            listaFiltrada = [...listaMovimientos];
            paginaActual = 1;
            renderizarTabla();
        }
    } catch (_) {
        const tbodyId = pestanaActiva === "salidas" ? "tabla-salidas-cuerpo" : "tabla-ingresos-cuerpo";
        document.getElementById(tbodyId).innerHTML = `<tr><td colspan="10" class="text-center py-6 text-red-500">Error al cargar datos.</td></tr>`;
    }
}

function renderizarTabla() {
    const total = listaFiltrada.length;
    const totalPaginas = Math.ceil(total / filasPorPagina) || 1;
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = listaFiltrada.slice(inicio, fin);

    if (pestanaActiva === "salidas") {
        const tbody = document.getElementById("tabla-salidas-cuerpo");
        if (total === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-6 text-gray-400">No hay salidas registradas en el rango de fechas.</td></tr>`;
        } else {
            tbody.innerHTML = registros.map(item => `
                <tr class="hover:bg-amber-50/40 transition">
                    <td class="py-3 px-4 font-mono font-bold text-gray-600">${item.fecha_hora}</td>
                    <td class="py-3 px-4 font-mono font-bold text-amber-700">${item.insumo_codigo}</td>
                    <td class="py-3 px-4 font-semibold text-gray-900">${item.insumo_descripcion}</td>
                    <td class="py-3 px-4 text-center font-black text-gray-800">${item.cantidad}</td>
                    <td class="py-3 px-4 font-bold uppercase text-gray-800">${item.personal_nombre}</td>
                    <td class="py-3 px-4 font-mono text-gray-600">${item.personal_dni}</td>
                    <td class="py-3 px-4 text-gray-600 text-[11px]">${item.personal_area}</td>
                    <td class="py-3 px-4 text-gray-500 text-[11px]">${item.personal_cargo}</td>
                    <td class="py-3 px-4 font-mono text-[11px] text-gray-400 uppercase">${item.usuario_registro}</td>
                    <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
                        <button onclick="abrirEditarSalida(${item.id})" class="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition" title="Editar Despacho">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="anularSalida(${item.id}, '${item.insumo_descripcion.replace(/'/g, "\\'")}', ${item.cantidad})" class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition" title="Anular Salida y Devolver Stock">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `).join("");
        }
    } else {
        const tbody = document.getElementById("tabla-ingresos-cuerpo");
        if (total === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-400">No hay ingresos registrados en el rango de fechas.</td></tr>`;
        } else {
            tbody.innerHTML = registros.map(item => `
                <tr class="hover:bg-amber-50/40 transition">
                    <td class="py-3 px-4 font-mono font-bold text-gray-600">${item.fecha_registro}</td>
                    <td class="py-3 px-4 font-mono font-bold text-green-700">${item.insumo_codigo}</td>
                    <td class="py-3 px-4 font-semibold text-gray-900">${item.insumo_descripcion}</td>
                    <td class="py-3 px-4 font-mono font-bold text-gray-700">${item.numero_lote}</td>
                    <td class="py-3 px-4 text-center font-black text-green-800">${item.cantidad}</td>
                    <td class="py-3 px-4 font-mono text-gray-600">${item.fecha_vencimiento || 'S/V'}</td>
                    <td class="py-3 px-4 text-gray-600 text-[11px]">${item.proveedor || '---'}</td>
                    <td class="py-3 px-4 font-mono text-[11px] text-gray-400 uppercase">${item.usuario_registro}</td>
                </tr>
            `).join("");
        }
    }

    document.getElementById("info-paginacion").innerText = `Mostrando ${total === 0 ? 0 : inicio + 1} - ${fin} de ${total} registros`;

    const controles = document.getElementById("controles-paginacion");
    controles.innerHTML = `
        <button onclick="cambiarPagina(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="px-3 py-1 font-bold text-gray-700 font-mono">${paginaActual} / ${totalPaginas}</span>
        <button onclick="cambiarPagina(${paginaActual + 1})" ${paginaActual === totalPaginas ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;
}

function cambiarPagina(p) {
    paginaActual = p;
    renderizarTabla();
}

async function cargarSelectorInsumos() {
    try {
        const res = await fetch(`${API_MOV}/insumos/selector`, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            catalogoInsumos = json.data;

            const optsSalida = `<option value="">-- Seleccione Insumo --</option>` + catalogoInsumos.map(i => `
                <option value="${i.id}" data-stock="${i.stock_disponible}">${i.codigo} - ${i.descripcion} (Disp: ${i.stock_disponible})</option>
            `).join("");
            document.getElementById("sal-insumo-select").innerHTML = optsSalida;

            const optsIngreso = `<option value="">-- Seleccione Insumo --</option>` + catalogoInsumos.map(i => `
                <option value="${i.id}">${i.codigo} - ${i.descripcion}</option>
            `).join("");
            document.getElementById("ing-insumo-select").innerHTML = optsIngreso;

            document.getElementById("sal-insumo-select").addEventListener("change", (e) => {
                const opt = e.target.selectedOptions[0];
                const stock = opt ? opt.getAttribute("data-stock") || 0 : 0;
                document.getElementById("sal-stock-disp").innerText = stock;
                document.getElementById("sal-cantidad").max = stock;
            });
        }
    } catch (_) {}
}

function abrirModalSalida() {
    document.getElementById("sal-insumo-select").value = "";
    document.getElementById("sal-stock-disp").innerText = "0";
    document.getElementById("sal-cantidad").value = "1";
    document.getElementById("sal-buscar-personal").value = "";
    document.getElementById("sal-preview-personal").classList.add("hidden");
    document.getElementById("btn-guardar-salida").disabled = true;
    personalSeleccionado = null;
    modalSalida.classList.add("active");
}

function configurarBuscadorPersonal() {
    const input = document.getElementById("sal-buscar-personal");
    const sugerencias = document.getElementById("sal-sugerencias-personal");

    input.addEventListener("input", async (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) {
            sugerencias.classList.add("hidden");
            return;
        }

        try {
            const res = await fetch(`${API_MOV}/personal/buscar?q=${encodeURIComponent(q)}`, { headers: getHeaders() });
            const json = await res.json();

            if (json.status === "success" && json.data.length > 0) {
                sugerencias.innerHTML = json.data.map(p => `
                    <div class="p-2.5 hover:bg-amber-50 cursor-pointer border-b border-gray-100 text-xs" onclick='seleccionarPersonal(${JSON.stringify(p)})'>
                        <p class="font-bold text-gray-800 uppercase">${p.nombres}</p>
                        <p class="text-[10px] text-gray-500 font-mono">DNI: ${p.dni} | Área: ${p.area} | Alias: ${p.alias || '---'}</p>
                    </div>
                `).join("");
                sugerencias.classList.remove("hidden");
            } else {
                sugerencias.classList.add("hidden");
            }
        } catch (_) {}
    });
}

window.seleccionarPersonal = function(p) {
    personalSeleccionado = p;
    document.getElementById("sal-sugerencias-personal").classList.add("hidden");
    document.getElementById("sal-buscar-personal").value = p.nombres;

    document.getElementById("sal-pv-nombre").innerText = p.nombres;
    document.getElementById("sal-pv-dni").innerText = p.dni;
    document.getElementById("sal-pv-area").innerText = p.area;
    document.getElementById("sal-pv-cargo").innerText = p.cargo;

    document.getElementById("sal-preview-personal").classList.remove("hidden");
    document.getElementById("btn-guardar-salida").disabled = false;
};

async function guardarSalida() {
    const insumo_id = parseInt(document.getElementById("sal-insumo-select").value, 10);
    const cantidad = parseInt(document.getElementById("sal-cantidad").value, 10);

    if (!insumo_id || !cantidad || !personalSeleccionado) {
        Swal.fire({ icon: "warning", title: "Atención", text: "Seleccione un insumo, cantidad y personal receptor.", confirmButtonColor: "#d97706" });
        return;
    }

    try {
        const res = await fetch(`${API_MOV}/salidas`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                insumo_id,
                cantidad,
                personal_id: personalSeleccionado.id,
                personal_dni: personalSeleccionado.dni,
                personal_nombre: personalSeleccionado.nombres,
                personal_area: personalSeleccionado.area,
                personal_cargo: personalSeleccionado.cargo,
                usuario_registro: usuarioSesion
            })
        });
        const json = await res.json();

        if (res.ok) {
            modalSalida.classList.remove("active");
            Swal.fire({ icon: "success", title: "Salida Confirmada", text: json.message, timer: 1800, showConfirmButton: false });
            await cargarSelectorInsumos();
            cargarBandeja();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo procesar la salida.", confirmButtonColor: "#d97706" });
    }
}

// Configuración de edición de salida
function configurarBuscadorPersonalEdit() {
    const input = document.getElementById("edit-sal-buscar-personal");
    const sugerencias = document.getElementById("edit-sal-sugerencias-personal");

    input.addEventListener("input", async (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) { sugerencias.classList.add("hidden"); return; }
        try {
            const res = await fetch(`${API_MOV}/personal/buscar?q=${encodeURIComponent(q)}`, { headers: getHeaders() });
            const json = await res.json();
            if (json.status === "success" && json.data.length > 0) {
                sugerencias.innerHTML = json.data.map(p => `
                    <div class="p-2.5 hover:bg-amber-50 cursor-pointer border-b border-gray-100 text-xs" onclick='seleccionarPersonalEdit(${JSON.stringify(p)})'>
                        <p class="font-bold text-gray-800 uppercase">${p.nombres}</p>
                        <p class="text-[10px] text-gray-500 font-mono">DNI: ${p.dni} | Área: ${p.area}</p>
                    </div>
                `).join("");
                sugerencias.classList.remove("hidden");
            } else {
                sugerencias.classList.add("hidden");
            }
        } catch (_) {}
    });
}

window.seleccionarPersonalEdit = function(p) {
    editPersonalSeleccionado = p;
    document.getElementById("edit-sal-sugerencias-personal").classList.add("hidden");
    document.getElementById("edit-sal-buscar-personal").value = p.nombres;
    document.getElementById("edit-sal-pv-nombre").innerText = p.nombres;
    document.getElementById("edit-sal-pv-dni").innerText = p.dni;
    document.getElementById("edit-sal-pv-area").innerText = p.area;
    document.getElementById("edit-sal-pv-cargo").innerText = p.cargo;
};

window.abrirEditarSalida = function(id) {
    const item = listaMovimientos.find(m => m.id === id);
    if (!item) return;

    document.getElementById("edit-sal-id").value = item.id;
    document.getElementById("edit-sal-insumo-desc").innerText = `${item.insumo_codigo} - ${item.insumo_descripcion}`;
    document.getElementById("edit-sal-cantidad").value = item.cantidad;
    document.getElementById("edit-sal-buscar-personal").value = item.personal_nombre;

    editPersonalSeleccionado = {
        dni: item.personal_dni,
        nombres: item.personal_nombre,
        area: item.personal_area,
        cargo: item.personal_cargo
    };

    document.getElementById("edit-sal-pv-nombre").innerText = item.personal_nombre;
    document.getElementById("edit-sal-pv-dni").innerText = item.personal_dni;
    document.getElementById("edit-sal-pv-area").innerText = item.personal_area;
    document.getElementById("edit-sal-pv-cargo").innerText = item.personal_cargo;

    modalEditarSalida.classList.add("active");
};

async function guardarEdicionSalida() {
    const id = document.getElementById("edit-sal-id").value;
    const cantidad_nueva = parseInt(document.getElementById("edit-sal-cantidad").value, 10);

    if (!cantidad_nueva || cantidad_nueva <= 0 || !editPersonalSeleccionado) {
        Swal.fire({ icon: "warning", title: "Datos Inválidos", text: "Verifique la cantidad y el personal.", confirmButtonColor: "#d97706" });
        return;
    }

    try {
        const res = await fetch(`${API_MOV}/salidas/${id}`, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify({
                cantidad_nueva,
                personal_dni: editPersonalSeleccionado.dni,
                personal_nombre: editPersonalSeleccionado.nombres,
                personal_area: editPersonalSeleccionado.area,
                personal_cargo: editPersonalSeleccionado.cargo,
                usuario_registro: usuarioSesion
            })
        });
        const json = await res.json();

        if (res.ok) {
            modalEditarSalida.classList.remove("active");
            Swal.fire({ icon: "success", title: "Actualizado", text: json.message, timer: 1800, showConfirmButton: false });
            await cargarSelectorInsumos();
            cargarBandeja();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de Red", text: "No se pudo actualizar.", confirmButtonColor: "#d97706" });
    }
}

window.anularSalida = async function(id, descripcion, cantidad) {
    const confirm = await Swal.fire({
        title: "¿Anular Salida?",
        html: `¿Desea anular el despacho de <b>${cantidad} unidad(es)</b> de <i>${descripcion}</i>?<br><br><span class="text-xs text-green-700 font-bold">El stock se reintegrará automáticamente al inventario.</span>`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#6b7280",
        confirmButtonText: "Sí, anular y devolver stock",
        cancelButtonText: "Cancelar"
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`${API_MOV}/salidas/${id}`, { method: "DELETE", headers: getHeaders() });
            const json = await res.json();
            if (res.ok) {
                Swal.fire({ icon: "success", title: "Anulado", text: json.message, timer: 2000, showConfirmButton: false });
                await cargarSelectorInsumos();
                cargarBandeja();
            } else {
                Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
            }
        } catch (_) {
            Swal.fire({ icon: "error", title: "Error de Red", text: "No se pudo anular la salida.", confirmButtonColor: "#d97706" });
        }
    }
};

function abrirModalIngreso() {
    document.getElementById("ing-insumo-select").value = "";
    document.getElementById("ing-lote").value = "";
    document.getElementById("ing-cantidad").value = "1";
    document.getElementById("ing-fecha-ingreso").value = new Date().toISOString().split("T")[0];
    document.getElementById("ing-fecha-vencimiento").value = "";
    modalIngreso.classList.add("active");
}

async function guardarIngreso() {
    const insumo_id = parseInt(document.getElementById("ing-insumo-select").value, 10);
    const numero_lote = document.getElementById("ing-lote").value.trim().toUpperCase();
    const cantidad = parseInt(document.getElementById("ing-cantidad").value, 10);
    const fecha_ingreso = document.getElementById("ing-fecha-ingreso").value;
    const fecha_vencimiento = document.getElementById("ing-fecha-vencimiento").value || null;

    if (!insumo_id || !numero_lote || !cantidad || !fecha_ingreso) {
        Swal.fire({ icon: "warning", title: "Faltan Datos", text: "Insumo, lote, cantidad y fecha de ingreso son obligatorios.", confirmButtonColor: "#d97706" });
        return;
    }

    if (fecha_vencimiento && fecha_ingreso > fecha_vencimiento) {
        Swal.fire({ icon: "warning", title: "Inconsistencia de Fechas", text: "La fecha de vencimiento no puede ser anterior a la de ingreso.", confirmButtonColor: "#d97706" });
        return;
    }

    try {
        const res = await fetch(`${API_MOV}/ingresos`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                insumo_id,
                numero_lote,
                fecha_ingreso,
                fecha_vencimiento,
                cantidad,
                proveedor: null,
                usuario_registro: usuarioSesion
            })
        });
        const json = await res.json();

        if (res.status === 201) {
            modalIngreso.classList.remove("active");
            Swal.fire({ icon: "success", title: "Ingreso Registrado", text: json.message, timer: 1800, showConfirmButton: false });
            await cargarSelectorInsumos();
            cargarBandeja();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo procesar el ingreso.", confirmButtonColor: "#d97706" });
    }
}