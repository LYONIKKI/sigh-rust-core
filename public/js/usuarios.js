// public/js/usuarios.js

const API_USUARIOS = "http://172.16.10.240:4000/api/usuarios";
let rolSesion = "admin_rust";

// Variables de datos y paginación
let listaUsuarios = [];
let listaFiltradaUsuarios = [];
let paginaActualUsuarios = 1;
const filasPorPaginaUsuarios = 10;

// Elementos Modal Crear
const modalCrear = document.getElementById("modal-crear");
const btnAbrirCrear = document.getElementById("btn-abrir-crear");
const btnCerrarCrear = document.getElementById("btn-cerrar-crear");
const btnCancelarCrear = document.getElementById("btn-cancelar-crear");
const btnGuardarCrear = document.getElementById("btn-guardar-crear");

// Elementos Modal Editar
const modalEditar = document.getElementById("modal-editar");
const btnCerrarEditar = document.getElementById("btn-cerrar-editar");
const btnCancelarEditar = document.getElementById("btn-cancelar-editar");
const btnGuardarEditar = document.getElementById("btn-guardar-editar");

const btnRefrescar = document.getElementById("btn-refrescar-usuarios");
const filtroUsuarios = document.getElementById("filtro-usuarios");

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
    } catch (e) {
        console.warn("Usando rol por defecto.");
    }

    cargarUsuarios();

    btnAbrirCrear.addEventListener("click", () => {
        document.getElementById("crear-nombre").value = "";
        document.getElementById("crear-usuario").value = "";
        document.getElementById("crear-pass").value = "";
        document.getElementById("crear-rol").value = "telesalud_rust";
        modalCrear.classList.add("active");
    });
    btnCerrarCrear.addEventListener("click", () => modalCrear.classList.remove("active"));
    btnCancelarCrear.addEventListener("click", () => modalCrear.classList.remove("active"));
    btnGuardarCrear.addEventListener("click", guardarNuevoUsuario);

    btnCerrarEditar.addEventListener("click", () => modalEditar.classList.remove("active"));
    btnCancelarEditar.addEventListener("click", () => modalEditar.classList.remove("active"));
    btnGuardarEditar.addEventListener("click", guardarEdicionUsuario);

    btnRefrescar.addEventListener("click", cargarUsuarios);

    // Evento de búsqueda en tiempo real
    if (filtroUsuarios) {
        filtroUsuarios.addEventListener("input", (e) => {
            const termino = e.target.value.toLowerCase().trim();
            listaFiltradaUsuarios = listaUsuarios.filter(u => {
                const nombre = (u.nombre || "").toLowerCase();
                const usuario = (u.usuario || "").toLowerCase();
                const rol = (u.rol || "").toLowerCase();
                const id = String(u.id || "");

                return nombre.includes(termino) || usuario.includes(termino) ||
                       rol.includes(termino) || id.includes(termino);
            });
            paginaActualUsuarios = 1;
            renderizarPaginacionUsuarios();
        });
    }
});

async function cargarUsuarios() {
    const tbody = document.getElementById("tabla-usuarios-cuerpo");
    try {
        const res = await fetch(API_USUARIOS, { headers: getHeaders() });
        const json = await res.json();

        if (res.status === 403) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500 font-bold">Acceso restringido solo para administradores.</td></tr>`;
            return;
        }

        if (json.status === "success") {
            listaUsuarios = json.data;
            listaFiltradaUsuarios = [...listaUsuarios];
            document.getElementById("card-total-usuarios").innerText = json.total;
            paginaActualUsuarios = 1;
            renderizarPaginacionUsuarios();
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500">Error al consultar el directorio de usuarios.</td></tr>`;
    }
}

function renderizarPaginacionUsuarios() {
    const tbody = document.getElementById("tabla-usuarios-cuerpo");
    const total = listaFiltradaUsuarios.length;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-400">No se encontraron usuarios.</td></tr>`;
        document.getElementById("info-paginacion-usuarios").innerText = "Mostrando 0 de 0 usuarios";
        document.getElementById("controles-paginacion-usuarios").innerHTML = "";
        return;
    }

    const totalPaginas = Math.ceil(total / filasPorPaginaUsuarios);
    if (paginaActualUsuarios > totalPaginas) paginaActualUsuarios = totalPaginas;

    const inicio = (paginaActualUsuarios - 1) * filasPorPaginaUsuarios;
    const fin = Math.min(inicio + filasPorPaginaUsuarios, total);
    const registrosPagina = listaFiltradaUsuarios.slice(inicio, fin);

    tbody.innerHTML = registrosPagina.map((u) => {
        const idxGlobal = listaUsuarios.indexOf(u);
        const estadoBadge = u.estado === 1 
            ? `<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold">Activo</span>`
            : `<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">Inactivo</span>`;

        const rolBadge = u.rol === 'admin_rust'
            ? `<span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono font-bold">${u.rol}</span>`
            : `<span class="px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 font-mono font-semibold">${u.rol}</span>`;

        return `
            <tr class="hover:bg-amber-50/40 transition">
                <td class="py-3 px-4 font-mono font-bold text-gray-500">${u.id}</td>
                <td class="py-3 px-4 font-bold text-gray-900 uppercase">${u.nombre}</td>
                <td class="py-3 px-4 font-mono text-gray-700">${u.usuario}</td>
                <td class="py-3 px-4">${rolBadge}</td>
                <td class="py-3 px-4">${estadoBadge}</td>
                <td class="py-3 px-4 font-mono text-[11px] text-gray-500">${u.slug_destino}</td>
                <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
                    <button onclick="verUsuario(${idxGlobal})" class="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition" title="Ver Detalle">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button onclick="abrirEditarUsuario(${idxGlobal})" class="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition" title="Editar">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    ${u.id !== 58 ? `
                    <button onclick="eliminarUsuario(${u.id}, '${u.usuario}')" class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition" title="Eliminar">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>` : `<span class="p-1.5 text-gray-300"><i class="fa-solid fa-lock"></i></span>`}
                </td>
            </tr>
        `;
    }).join("");

    document.getElementById("info-paginacion-usuarios").innerText = `Mostrando ${inicio + 1} - ${fin} de ${total} usuarios`;

    const controles = document.getElementById("controles-paginacion-usuarios");
    controles.innerHTML = `
        <button onclick="cambiarPaginaUsuarios(${paginaActualUsuarios - 1})" ${paginaActualUsuarios === 1 ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="px-3 py-1 font-bold text-gray-700 font-mono">${paginaActualUsuarios} / ${totalPaginas}</span>
        <button onclick="cambiarPaginaUsuarios(${paginaActualUsuarios + 1})" ${paginaActualUsuarios === totalPaginas ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;
}

function cambiarPaginaUsuarios(nuevaPagina) {
    paginaActualUsuarios = nuevaPagina;
    renderizarPaginacionUsuarios();
}

async function guardarNuevoUsuario() {
    const nombre = document.getElementById("crear-nombre").value.trim();
    const usuario = document.getElementById("crear-usuario").value.trim();
    const password = document.getElementById("crear-pass").value.trim();
    const rol = document.getElementById("crear-rol").value;

    if (!nombre || !usuario || !password) {
        Swal.fire({ icon: "warning", title: "Campos incompletos", text: "Todos los campos son obligatorios.", confirmButtonColor: "#d97706" });
        return;
    }

    try {
        const res = await fetch(API_USUARIOS, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ nombre, usuario, password, rol })
        });
        const json = await res.json();

        if (res.status === 201) {
            modalCrear.classList.remove("active");
            Swal.fire({ icon: "success", title: "Usuario Registrado", text: json.message, timer: 1800, showConfirmButton: false });
            cargarUsuarios();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (e) {
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo crear el usuario.", confirmButtonColor: "#d97706" });
    }
}

function abrirEditarUsuario(idx) {
    const u = listaUsuarios[idx];
    if (!u) return;

    document.getElementById("editar-id").value = u.id;
    document.getElementById("editar-nombre").value = u.nombre;
    document.getElementById("editar-usuario").value = u.usuario;
    document.getElementById("editar-pass").value = "";
    document.getElementById("editar-rol").value = u.rol;
    document.getElementById("editar-estado").value = u.estado;

    modalEditar.classList.add("active");
}

async function guardarEdicionUsuario() {
    const id = document.getElementById("editar-id").value;
    const nombre = document.getElementById("editar-nombre").value.trim();
    const usuario = document.getElementById("editar-usuario").value.trim();
    const password = document.getElementById("editar-pass").value.trim();
    const rol = document.getElementById("editar-rol").value;
    const estado = parseInt(document.getElementById("editar-estado").value, 10);

    if (!nombre || !usuario) {
        Swal.fire({ icon: "warning", title: "Campos incompletos", text: "El nombre y usuario no pueden estar vacíos.", confirmButtonColor: "#d97706" });
        return;
    }

    const payload = {
        nombre,
        usuario,
        password: password ? password : null,
        rol,
        estado
    };

    try {
        const res = await fetch(`${API_USUARIOS}/${id}`, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (res.ok) {
            modalEditar.classList.remove("active");
            Swal.fire({ icon: "success", title: "Actualizado", text: json.message, timer: 1800, showConfirmButton: false });
            cargarUsuarios();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (e) {
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo actualizar el usuario.", confirmButtonColor: "#d97706" });
    }
}

function verUsuario(idx) {
    const u = listaUsuarios[idx];
    if (!u) return;

    Swal.fire({
        title: `<span class="text-sm font-bold text-gray-800">Ficha de Usuario #${u.id}</span>`,
        html: `
            <div class="text-left text-xs space-y-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p><b>Nombre Completo:</b> <span class="uppercase">${u.nombre}</span></p>
                <p><b>Nombre de Usuario:</b> <span class="font-mono">${u.usuario}</span></p>
                <p><b>Rol de Acceso:</b> <span class="font-mono text-amber-700 font-bold">${u.rol}</span></p>
                <p><b>Estado:</b> ${u.estado === 1 ? 'Activo' : 'Inactivo / Bloqueado'}</p>
                <p><b>Destino Asignado:</b> <span class="font-mono">${u.slug_destino}</span></p>
            </div>
        `,
        confirmButtonColor: "#d97706",
        confirmButtonText: "Cerrar"
    });
}

async function eliminarUsuario(id, usuario) {
    const confirm = await Swal.fire({
        title: `¿Eliminar a ${usuario}?`,
        text: `Esta acción removerá el acceso del usuario en PostgreSQL.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`${API_USUARIOS}/${id}`, {
                method: "DELETE",
                headers: getHeaders()
            });
            const json = await res.json();

            if (res.ok) {
                Swal.fire({ icon: 'success', title: 'Eliminado', text: json.message, timer: 1800, showConfirmButton: false });
                cargarUsuarios();
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: json.message, confirmButtonColor: '#d97706' });
            }
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo eliminar el usuario.', confirmButtonColor: "#d97706" });
        }
    }
}