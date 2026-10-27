// public/js/insumos.js

const API_INVENTARIO = "http://172.16.10.240:4000/api/lab/inventario/insumos";
let usuarioSesion = "ADMINISTRADOR RUST";
let rolSesion = "admin_rust";

let listaInsumos = [];
let listaFiltrada = [];
let paginaActual = 1;
const filasPorPagina = 12;

const modalCrear = document.getElementById("modal-crear");
const modalEditar = document.getElementById("modal-editar");

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

    cargarInventario();

    // Eventos Modal Crear
    document.getElementById("btn-abrir-crear").addEventListener("click", () => {
        document.getElementById("crear-codigo").value = "";
        document.getElementById("crear-descripcion").value = "";
        document.getElementById("crear-stock").value = "1";
        document.getElementById("crear-minimo").value = "2";
        document.getElementById("crear-valor").value = "0.00";
        document.getElementById("crear-proveedor").value = "";
        document.getElementById("crear-fecha-ingreso").value = new Date().toISOString().split("T")[0];
        document.getElementById("crear-fecha-vencimiento").value = "";
        modalCrear.classList.add("active");
    });
    document.getElementById("btn-cerrar-crear").addEventListener("click", () => modalCrear.classList.remove("active"));
    document.getElementById("btn-cancelar-crear").addEventListener("click", () => modalCrear.classList.remove("active"));
    document.getElementById("btn-guardar-crear").addEventListener("click", guardarInsumo);

    // Eventos Modal Editar
    document.getElementById("btn-cerrar-editar").addEventListener("click", () => modalEditar.classList.remove("active"));
    document.getElementById("btn-cancelar-editar").addEventListener("click", () => modalEditar.classList.remove("active"));
    document.getElementById("btn-guardar-editar").addEventListener("click", guardarEdicion);

    // Buscador en tiempo real
    document.getElementById("filtro-inventario").addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        listaFiltrada = listaInsumos.filter(i => {
            return i.codigo.toLowerCase().includes(q) ||
                   i.descripcion.toLowerCase().includes(q) ||
                   i.ubicacion.toLowerCase().includes(q) ||
                   (i.proveedor && i.proveedor.toLowerCase().includes(q));
        });
        paginaActual = 1;
        renderizarTabla();
    });

    document.getElementById("btn-refrescar").addEventListener("click", cargarInventario);
});

async function cargarInventario() {
    const tbody = document.getElementById("tabla-inventario-cuerpo");
    try {
        const res = await fetch(API_INVENTARIO, { headers: getHeaders() });
        const json = await res.json();

        if (res.status === 403) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-500 font-bold">Acceso denegado: solo personal de Laboratorio y Administradores.</td></tr>`;
            return;
        }

        if (json.status === "success") {
            listaInsumos = json.data;
            listaFiltrada = [...listaInsumos];
            document.getElementById("card-total-insumos").innerText = json.total;

            const criticos = listaInsumos.filter(i => i.stock_total <= i.stock_minimo).length;
            document.getElementById("card-stock-critico").innerText = criticos;

            paginaActual = 1;
            renderizarTabla();
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-500">Error al consultar el inventario.</td></tr>`;
    }
}

function renderizarTabla() {
    const tbody = document.getElementById("tabla-inventario-cuerpo");
    const total = listaFiltrada.length;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">No hay reactivos registrados.</td></tr>`;
        document.getElementById("info-paginacion").innerText = "Mostrando 0 de 0 registros";
        document.getElementById("controles-paginacion").innerHTML = "";
        return;
    }

    const totalPaginas = Math.ceil(total / filasPorPagina);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = listaFiltrada.slice(inicio, fin);

    tbody.innerHTML = registros.map(item => {
        let semaforo = `<span class="inline-block w-3 h-3 rounded-full bg-green-500 shadow-sm" title="Stock Óptimo"></span>`;
        if (item.stock_total === 0) {
            semaforo = `<span class="inline-block w-3 h-3 rounded-full bg-red-600 animate-pulse shadow-sm" title="Agotado"></span>`;
        } else if (item.stock_total <= item.stock_minimo) {
            semaforo = `<span class="inline-block w-3 h-3 rounded-full bg-yellow-500 shadow-sm" title="Stock Crítico"></span>`;
        }

        return `
            <tr class="hover:bg-amber-50/40 transition">
                <td class="py-3 px-4 text-center">${semaforo}</td>
                <td class="py-3 px-4 font-mono font-bold text-gray-600">${item.codigo}</td>
                <td class="py-3 px-4 font-semibold text-gray-900">${item.descripcion}</td>
                <td class="py-3 px-4 text-gray-600">${item.ubicacion}</td>
                <td class="py-3 px-4 text-center font-bold ${item.stock_total === 0 ? 'text-red-600' : 'text-gray-800'}">${item.stock_total}</td>
                <td class="py-3 px-4 text-gray-500 font-mono text-[11px]">${item.fecha_ingreso_reciente || '---'}</td>
                <td class="py-3 px-4 text-gray-500 font-mono text-[11px]">${item.fecha_vencimiento_proxima || 'S/V'}</td>
                <td class="py-3 px-4 text-gray-600 text-[11px]">${item.proveedor || '---'}</td>
                <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
                    <button onclick="abrirEditar(${item.id})" class="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition" title="Editar Ficha">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="eliminar(${item.id}, '${item.descripcion.replace(/'/g, "\\'")}')" class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition" title="Deshabilitar">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    document.getElementById("info-paginacion").innerText = `Mostrando ${inicio + 1} - ${fin} de ${total} registros`;

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

async function guardarInsumo() {
    const codigo = document.getElementById("crear-codigo").value.trim().toUpperCase();
    const descripcion = document.getElementById("crear-descripcion").value.trim().toUpperCase();
    const ubicacion = document.getElementById("crear-ubicacion").value;
    const stock_inicial = parseInt(document.getElementById("crear-stock").value, 10) || 0;
    const stock_minimo = parseInt(document.getElementById("crear-minimo").value, 10) || 2;
    const valor_unitario = parseFloat(document.getElementById("crear-valor").value) || 0.0;
    const proveedor = document.getElementById("crear-proveedor").value.trim().toUpperCase();
    const fecha_ingreso = document.getElementById("crear-fecha-ingreso").value;
    const fecha_vencimiento = document.getElementById("crear-fecha-vencimiento").value || null;

    // 1. Validación de campos obligatorios
    if (!codigo || !descripcion || !fecha_ingreso) {
        Swal.fire({
            icon: "warning",
            title: "Campos Incompletos",
            text: "El código oficial, la descripción y la fecha de ingreso son obligatorios.",
            confirmButtonColor: "#d97706"
        });
        return;
    }

    // 2. Validación de coherencia de fechas (Ingreso no puede ser posterior a Vencimiento)
    if (fecha_vencimiento && fecha_ingreso > fecha_vencimiento) {
        Swal.fire({
            icon: "warning",
            title: "Inconsistencia de Fechas",
            text: `La fecha de caducidad (${fecha_vencimiento}) no puede ser anterior a la fecha de ingreso (${fecha_ingreso}).`,
            confirmButtonColor: "#d97706"
        });
        return;
    }

    // 3. Preparación del payload (alias_registro toma el usuario autenticado)
    const payload = {
        codigo,
        descripcion,
        ubicacion,
        stock_inicial,
        stock_minimo,
        valor_unitario,
        proveedor: proveedor || null,
        fecha_ingreso,
        fecha_vencimiento,
        alias_registro: usuarioSesion, // <-- Guarda quién dio de alta el reactivo
        usuario_registro: usuarioSesion
    };

    const btnGuardar = document.getElementById("btn-guardar-crear");
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i><span>Guardando...</span>`;

    try {
        const res = await fetch(API_INVENTARIO, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const json = await res.json();

        btnGuardar.disabled = false;
        btnGuardar.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1.5"></i><span>Registrar Reactivo</span>`;

        if (res.status === 201) {
            modalCrear.classList.remove("active");
            Swal.fire({
                icon: "success",
                title: "Reactivo Registrado",
                text: json.message,
                timer: 1800,
                showConfirmButton: false
            });
            cargarInventario();
        } else {
            Swal.fire({
                icon: "error",
                title: "Error al Registrar",
                text: json.message || "No se pudo guardar el insumo.",
                confirmButtonColor: "#d97706"
            });
        }
    } catch (_) {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1.5"></i><span>Registrar Reactivo</span>`;
        Swal.fire({
            icon: "error",
            title: "Error de Conexión",
            text: "No hubo respuesta del servidor Rust.",
            confirmButtonColor: "#d97706"
        });
    }
}

function abrirEditar(id) {
    const item = listaInsumos.find(i => i.id === id);
    if (!item) return;

    document.getElementById("editar-id").value = item.id;
    document.getElementById("editar-descripcion").value = item.descripcion;
    document.getElementById("editar-ubicacion").value = item.ubicacion;
    document.getElementById("editar-proveedor").value = item.proveedor || "";
    document.getElementById("editar-stock-actual").value = item.stock_total;
    document.getElementById("editar-minimo").value = item.stock_minimo;
    document.getElementById("editar-valor").value = item.valor_unitario;
    document.getElementById("editar-estado").value = item.estado_insumo;

    modalEditar.classList.add("active");
}

async function guardarEdicion() {
    const id = document.getElementById("editar-id").value;
    const descripcion = document.getElementById("editar-descripcion").value.trim();
    const ubicacion = document.getElementById("editar-ubicacion").value;
    const proveedor = document.getElementById("editar-proveedor").value.trim();
    const stock_minimo = parseInt(document.getElementById("editar-minimo").value, 10) || 2;
    const valor_unitario = parseFloat(document.getElementById("editar-valor").value) || 0.0;
    const estado_insumo = document.getElementById("editar-estado").value;

    if (!descripcion) {
        Swal.fire({ icon: "warning", title: "Atención", text: "La descripción no puede estar vacía.", confirmButtonColor: "#d97706" });
        return;
    }

    try {
        const res = await fetch(`${API_INVENTARIO}/${id}`, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify({
                descripcion, ubicacion, proveedor: proveedor || null,
                stock_minimo, valor_unitario, estado_insumo
            })
        });
        const json = await res.json();

        if (res.ok) {
            modalEditar.classList.remove("active");
            Swal.fire({ icon: "success", title: "Actualizado", text: json.message, timer: 1800, showConfirmButton: false });
            cargarInventario();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo actualizar.", confirmButtonColor: "#d97706" });
    }
}

async function eliminar(id, descripcion) {
    const confirm = await Swal.fire({
        title: "¿Deshabilitar Reactivo?",
        text: `Se retirará '${descripcion}' del catálogo activo.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#6b7280",
        confirmButtonText: "Sí, deshabilitar",
        cancelButtonText: "Cancelar"
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`${API_INVENTARIO}/${id}`, { method: "DELETE", headers: getHeaders() });
            const json = await res.json();
            if (res.ok) {
                Swal.fire({ icon: "success", title: "Completado", text: json.message, timer: 1800, showConfirmButton: false });
                cargarInventario();
            } else {
                Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
            }
        } catch (_) {
            Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo deshabilitar.", confirmButtonColor: "#d97706" });
        }
    }
}