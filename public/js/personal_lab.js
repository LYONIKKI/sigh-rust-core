// public/js/personal_lab.js

const API_PERSONAL = "http://172.16.10.240:4000/api/lab/personal";
let rolSesion = "admin_rust";

let listaPersonal = [];
let listaFiltrada = [];
let paginaActual = 1;
const filasPorPagina = 12;

const modalPersonal = document.getElementById("modal-personal");
const modalVer = document.getElementById("modal-ver");

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
            if (sess && sess.rol) rolSesion = sess.rol.toLowerCase().trim();
        }
    } catch (_) {}

    cargarPersonal();

    // Eventos Modal Registro/Edición
    document.getElementById("btn-abrir-crear").addEventListener("click", () => abrirFormulario());
    document.getElementById("btn-cerrar-modal").addEventListener("click", () => modalPersonal.classList.remove("active"));
    document.getElementById("btn-cancelar-modal").addEventListener("click", () => modalPersonal.classList.remove("active"));
    document.getElementById("btn-guardar-personal").addEventListener("click", guardarDatos);

    // Eventos Modal Ver
    document.getElementById("btn-cerrar-ver").addEventListener("click", () => modalVer.classList.remove("active"));
    document.getElementById("btn-cerrar-ver-pie").addEventListener("click", () => modalVer.classList.remove("active"));

    // Buscador
    document.getElementById("filtro-personal").addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        listaFiltrada = listaPersonal.filter(p => {
            return p.dni.toLowerCase().includes(q) ||
                   p.nombres.toLowerCase().includes(q) ||
                   p.area.toLowerCase().includes(q) ||
                   p.cargo.toLowerCase().includes(q) ||
                   (p.alias && p.alias.toLowerCase().includes(q));
        });
        paginaActual = 1;
        renderizarTabla();
    });

    document.getElementById("btn-refrescar").addEventListener("click", cargarPersonal);
});

async function cargarPersonal() {
    const tbody = document.getElementById("tabla-personal-cuerpo");
    try {
        const res = await fetch(API_PERSONAL, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            listaPersonal = json.data;
            listaFiltrada = [...listaPersonal];
            document.getElementById("card-total-personal").innerText = json.total;

            const areasUnicas = new Set(listaPersonal.map(p => p.area));
            document.getElementById("card-total-areas").innerText = areasUnicas.size;

            paginaActual = 1;
            renderizarTabla();
        }
    } catch (_) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500">Error al consultar catálogo de personal.</td></tr>`;
    }
}

function renderizarTabla() {
    const tbody = document.getElementById("tabla-personal-cuerpo");
    const total = listaFiltrada.length;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-400">No se encontraron registros.</td></tr>`;
        document.getElementById("info-paginacion").innerText = "Mostrando 0 de 0 registros";
        document.getElementById("controles-paginacion").innerHTML = "";
        return;
    }

    const totalPaginas = Math.ceil(total / filasPorPagina) || 1;
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = listaFiltrada.slice(inicio, fin);

    tbody.innerHTML = registros.map((item, idx) => `
        <tr class="hover:bg-amber-50/40 transition">
            <td class="py-3 px-4 text-center font-bold text-gray-400 font-mono">${inicio + idx + 1}</td>
            <td class="py-3 px-4 font-mono font-bold text-amber-700">${item.dni}</td>
            <td class="py-3 px-4 font-bold text-gray-900">${item.nombres}</td>
            <td class="py-3 px-4 text-gray-600 text-[11px]">${item.area}</td>
            <td class="py-3 px-4 text-gray-600 text-[11px]">${item.cargo}</td>
            <td class="py-3 px-4 font-bold text-gray-700">${item.alias || '---'}</td>
            <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
                <button onclick="verDetalles(${item.id})" class="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition" title="Ver Ficha">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button onclick="abrirFormulario(${item.id})" class="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition" title="Editar Personal">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="eliminarPersonal(${item.id}, '${item.nombres.replace(/'/g, "\\'")}')" class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition" title="Dar de Baja">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join("");

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

function abrirFormulario(id = null) {
    if (id) {
        const p = listaPersonal.find(item => item.id === id);
        if (!p) return;
        document.getElementById("modal-titulo").innerText = "Editar Personal Receptor";
        document.getElementById("btn-texto-guardar").innerText = "Actualizar Cambios";
        document.getElementById("personal-id").value = p.id;
        document.getElementById("personal-dni").value = p.dni;
        document.getElementById("personal-nombres").value = p.nombres;
        document.getElementById("personal-area").value = p.area;
        document.getElementById("personal-cargo").value = p.cargo;
        document.getElementById("personal-alias").value = p.alias !== "---" ? p.alias : "";
    } else {
        document.getElementById("modal-titulo").innerText = "Nuevo Personal Receptor";
        document.getElementById("btn-texto-guardar").innerText = "Registrar Personal";
        document.getElementById("personal-id").value = "";
        document.getElementById("personal-dni").value = "";
        document.getElementById("personal-nombres").value = "";
        document.getElementById("personal-area").value = "LABORATORIO CENTRAL";
        document.getElementById("personal-cargo").value = "TÉCNICO EN LABORATORIO";
        document.getElementById("personal-alias").value = "";
    }
    modalPersonal.classList.add("active");
}

async function guardarDatos() {
    const id = document.getElementById("personal-id").value;
    const dni = document.getElementById("personal-dni").value.trim();
    const nombres = document.getElementById("personal-nombres").value.trim().toUpperCase();
    const area = document.getElementById("personal-area").value;
    const cargo = document.getElementById("personal-cargo").value.trim().toUpperCase();
    const alias = document.getElementById("personal-alias").value.trim().toUpperCase() || null;

    if (!dni || !nombres || !cargo) {
        Swal.fire({ icon: "warning", title: "Campos Incompletos", text: "DNI, Nombres y Cargo son requeridos.", confirmButtonColor: "#d97706" });
        return;
    }

    const payload = { dni, nombres, area, cargo, alias };
    const metodo = id ? "PUT" : "POST";
    const endpoint = id ? `${API_PERSONAL}/${id}` : API_PERSONAL;

    try {
        const res = await fetch(endpoint, {
            method: metodo,
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (res.ok) {
            modalPersonal.classList.remove("active");
            Swal.fire({ icon: "success", title: "Completado", text: json.message, timer: 1800, showConfirmButton: false });
            cargarPersonal();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de Conexión", text: "No hubo respuesta del backend.", confirmButtonColor: "#d97706" });
    }
}

async function verDetalles(id) {
    try {
        const res = await fetch(`${API_PERSONAL}/${id}`, { headers: getHeaders() });
        const json = await res.json();
        if (json.status === "success") {
            const p = json.data;
            document.getElementById("ver-nombres").innerText = p.nombres;
            document.getElementById("ver-dni").innerText = p.dni;
            document.getElementById("ver-alias").innerText = p.alias || "---";
            document.getElementById("ver-area").innerText = p.area;
            document.getElementById("ver-cargo").innerText = p.cargo;
            document.getElementById("ver-fecha").innerText = p.creado_en || "---";
            modalVer.classList.add("active");
        }
    } catch (_) {}
}

async function eliminarPersonal(id, nombres) {
    const confirm = await Swal.fire({
        title: "¿Dar de baja?",
        text: `Se retirará a '${nombres}' de la lista de receptores autorizados.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#dc2626",
        cancelButtonColor: "#6b7280",
        confirmButtonText: "Sí, deshabilitar",
        cancelButtonText: "Cancelar"
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`${API_PERSONAL}/${id}`, { method: "DELETE", headers: getHeaders() });
            const json = await res.json();
            if (res.ok) {
                Swal.fire({ icon: "success", title: "Deshabilitado", text: json.message, timer: 1800, showConfirmButton: false });
                cargarPersonal();
            } else {
                Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
            }
        } catch (_) {
            Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo retirar al personal.", confirmButtonColor: "#d97706" });
        }
    }
}