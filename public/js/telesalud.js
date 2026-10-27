// public/js/telesalud.js

const API_BASE = "http://172.16.10.240:4000/api/telesalud";
let usuarioSesion = "ADMINISTRADOR RUST";
let rolSesion = "admin_rust";
let datosAtencionActual = null;

// Variables de datos y paginación
let listaAtencionesHoy = [];
let listaFiltradaTelesalud = [];
let paginaActualTelesalud = 1;
const filasPorPaginaTelesalud = 10;

// Elementos del DOM
const modalAsignar = document.getElementById("modal-asignar");
const btnAbrirModal = document.getElementById("btn-abrir-modal");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");
const btnCancelar = document.getElementById("btn-cancelar");
const btnBuscarCuenta = document.getElementById("btn-buscar-cuenta");
const inputCuenta = document.getElementById("input-cuenta");
const inputFuaEditado = document.getElementById("input-fua-editado");
const btnGuardarFua = document.getElementById("btn-guardar-fua");
const previewPaciente = document.getElementById("preview-paciente");
const btnRefrescar = document.getElementById("btn-refrescar");
const filtroTelesalud = document.getElementById("filtro-telesalud");

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
    } catch (e) {
        console.warn("Usando sesión por defecto.");
    }

    cargarSiguienteFua();
    cargarTablaHoy();

    btnAbrirModal.addEventListener("click", abrirModal);
    btnCerrarModal.addEventListener("click", cerrarModal);
    btnCancelar.addEventListener("click", cerrarModal);

    btnRefrescar.addEventListener("click", () => {
        cargarSiguienteFua();
        cargarTablaHoy();
    });

    inputCuenta.addEventListener("keypress", (e) => {
        if (e.key === "Enter") buscarCuenta();
    });

    btnBuscarCuenta.addEventListener("click", buscarCuenta);
    btnGuardarFua.addEventListener("click", guardarFua);

    // Evento de búsqueda en tiempo real
    if (filtroTelesalud) {
        filtroTelesalud.addEventListener("input", (e) => {
            const termino = e.target.value.toLowerCase().trim();
            listaFiltradaTelesalud = listaAtencionesHoy.filter(item => {
                const paciente = (item.paciente_nombre || "").toLowerCase();
                const cuenta = String(item.id_cuenta_atencion || "");
                const doc = String(item.documento_numero || "");
                const hc = String(item.nro_historia_clinica || "");
                const fuaOrig = String(item.fua_numero_original || "");
                const fuaEdit = String(item.fua_numero_editado || "");
                const medico = (item.fua_medico || "").toLowerCase();
                const servicio = (item.cita_servicio_jamo || "").toLowerCase();

                return paciente.includes(termino) || cuenta.includes(termino) ||
                       doc.includes(termino) || hc.includes(termino) ||
                       fuaOrig.includes(termino) || fuaEdit.includes(termino) ||
                       medico.includes(termino) || servicio.includes(termino);
            });
            paginaActualTelesalud = 1;
            renderizarPaginacionTelesalud();
        });
    }
});

function abrirModal() {
    datosAtencionActual = null;
    inputCuenta.value = "";
    previewPaciente.classList.add("hidden");
    btnGuardarFua.disabled = true;
    modalAsignar.classList.add("active");
    cargarSiguienteFua();
    setTimeout(() => inputCuenta.focus(), 100);
}

function cerrarModal() {
    modalAsignar.classList.remove("active");
}

async function cargarSiguienteFua() {
    try {
        const res = await fetch(`${API_BASE}/fua/siguiente`, { headers: getHeaders() });
        const json = await res.json();
        if (json.status === "success") {
            document.getElementById("card-siguiente-fua").innerText = json.siguiente_fua;
            inputFuaEditado.value = json.siguiente_fua;
        }
    } catch (err) {
        console.error("Error al obtener correlativo:", err);
    }
}

async function cargarTablaHoy() {
    const tbody = document.getElementById("tabla-cuerpo-hoy");
    try {
        const res = await fetch(`${API_BASE}/fua/hoy`, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            listaAtencionesHoy = json.data;
            listaFiltradaTelesalud = [...listaAtencionesHoy];
            document.getElementById("card-total-hoy").innerText = json.total;
            paginaActualTelesalud = 1;
            renderizarPaginacionTelesalud();
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-500">Error al cargar la bandeja del día.</td></tr>`;
    }
}

// Renderizado de la tabla con paginación
function renderizarPaginacionTelesalud() {
    const tbody = document.getElementById("tabla-cuerpo-hoy");
    const total = listaFiltradaTelesalud.length;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">No se encontraron atenciones registradas.</td></tr>`;
        document.getElementById("info-paginacion-telesalud").innerText = "Mostrando 0 de 0 registros";
        document.getElementById("controles-paginacion-telesalud").innerHTML = "";
        return;
    }

    const totalPaginas = Math.ceil(total / filasPorPaginaTelesalud);
    if (paginaActualTelesalud > totalPaginas) paginaActualTelesalud = totalPaginas;

    const inicio = (paginaActualTelesalud - 1) * filasPorPaginaTelesalud;
    const fin = Math.min(inicio + filasPorPaginaTelesalud, total);
    const registrosPagina = listaFiltradaTelesalud.slice(inicio, fin);

    tbody.innerHTML = registrosPagina.map((item, index) => {
        const idxGlobal = listaAtencionesHoy.indexOf(item);
        return `
            <tr class="hover:bg-amber-50/40 transition">
                <td class="py-3 px-4 font-mono font-bold text-gray-500">${item.hora_registro}</td>
                <td class="py-3 px-4 font-bold text-gray-800">${item.id_cuenta_atencion}</td>
                <td class="py-3 px-4 font-semibold text-gray-900 uppercase">${item.paciente_nombre || '---'}</td>
                <td class="py-3 px-4 text-gray-600">${item.documento_numero || 'S/D'} / HC: ${item.nro_historia_clinica || item.documento_numero || 'S/D'}</td>
                <td class="py-3 px-4 font-mono text-gray-500">${item.fua_numero_original || '---'}</td>
                <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-mono font-bold">${item.fua_numero_editado}</span></td>
                <td class="py-3 px-4 text-gray-600 truncate max-w-xs uppercase">${item.fua_medico || item.cita_servicio_jamo || '---'}</td>
                <td class="py-3 px-4 text-gray-400 text-[11px] uppercase">${item.usuario_registro}</td>
                <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
                    <button onclick="verDetalle(${idxGlobal})" class="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition" title="Ver Detalle">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button onclick="editarFua(${item.id_cuenta_atencion}, '${item.fua_numero_editado}')" class="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition" title="Editar FUA">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="eliminarFua(${item.id_cuenta_atencion})" class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition" title="Eliminar / Liberar FUA">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    document.getElementById("info-paginacion-telesalud").innerText = `Mostrando ${inicio + 1} - ${fin} de ${total} registros`;

    // Botones de Anterior y Siguiente
    const controles = document.getElementById("controles-paginacion-telesalud");
    controles.innerHTML = `
        <button onclick="cambiarPaginaTelesalud(${paginaActualTelesalud - 1})" ${paginaActualTelesalud === 1 ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="px-3 py-1 font-bold text-gray-700 font-mono">${paginaActualTelesalud} / ${totalPaginas}</span>
        <button onclick="cambiarPaginaTelesalud(${paginaActualTelesalud + 1})" ${paginaActualTelesalud === totalPaginas ? 'disabled class="px-2.5 py-1 rounded border border-gray-200 text-gray-300 cursor-not-allowed"' : 'class="px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100 font-semibold transition"'}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;
}

function cambiarPaginaTelesalud(nuevaPagina) {
    paginaActualTelesalud = nuevaPagina;
    renderizarPaginacionTelesalud();
}

async function buscarCuenta() {
    const cuenta = inputCuenta.value.trim();
    if (!cuenta) {
        Swal.fire({ icon: "warning", title: "Atención", text: "Ingresa el número de cuenta de atención.", confirmButtonColor: "#d97706" });
        return;
    }

    btnBuscarCuenta.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    btnBuscarCuenta.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/fua/${cuenta}`, { headers: getHeaders() });
        const json = await res.json();

        btnBuscarCuenta.innerHTML = `<i class="fa-solid fa-magnifying-glass mr-1.5"></i><span>Buscar</span>`;
        btnBuscarCuenta.disabled = false;

        if (res.status === 403) {
            Swal.fire({ icon: "error", title: "Acceso Denegado", text: json.message, confirmButtonColor: "#d97706" });
            return;
        }

        if (res.status === 404 || json.status === "error") {
            previewPaciente.classList.add("hidden");
            btnGuardarFua.disabled = true;
            Swal.fire({ icon: "error", title: "No encontrado", text: json.message || "No existe la cuenta de atención.", confirmButtonColor: "#d97706" });
            return;
        }

        datosAtencionActual = json.data;

        const doc = (datosAtencionActual.documento_numero && datosAtencionActual.documento_numero.trim()) ? datosAtencionActual.documento_numero.trim() : "S/D";
        const hc = (datosAtencionActual.nro_historia_clinica && datosAtencionActual.nro_historia_clinica.trim()) ? datosAtencionActual.nro_historia_clinica.trim() : doc;

        document.getElementById("pv-nombre").innerText = datosAtencionActual.paciente_nombre || "---";
        document.getElementById("pv-doc").innerText = `${doc} / HC: ${hc}`;
        document.getElementById("pv-fua-orig").innerText = datosAtencionActual.fua_numero_original || "Sin FUA original";
        document.getElementById("pv-servicio").innerText = datosAtencionActual.cita_servicio_jamo || "Consulta Externa";
        document.getElementById("pv-medico").innerText = datosAtencionActual.fua_medico || "---";

        const badgeEstado = document.getElementById("badge-estado-fua");

        if (datosAtencionActual.fua_numero_editado) {
            badgeEstado.innerText = `Asignado: ${datosAtencionActual.fua_numero_editado}`;
            badgeEstado.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800";
            inputFuaEditado.value = datosAtencionActual.fua_numero_editado;
            btnGuardarFua.disabled = true;

            Swal.fire({
                icon: "info",
                title: "Cuenta Ya Registrada",
                text: `Esta atención ya fue guardada con el FUA Telesalud: ${datosAtencionActual.fua_numero_editado}.`,
                confirmButtonColor: "#d97706"
            });
        } else {
            badgeEstado.innerText = "Disponible para Asignar";
            badgeEstado.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800";
            btnGuardarFua.disabled = false;
        }

        previewPaciente.classList.remove("hidden");

    } catch (err) {
        btnBuscarCuenta.innerHTML = `<i class="fa-solid fa-magnifying-glass mr-1.5"></i><span>Buscar</span>`;
        btnBuscarCuenta.disabled = false;
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo comunicar con el servidor Rust.", confirmButtonColor: "#d97706" });
    }
}

async function guardarFua() {
    if (!datosAtencionActual) return;

    const fuaEditado = inputFuaEditado.value.trim();
    if (!fuaEditado) {
        Swal.fire({ icon: "warning", title: "Faltan datos", text: "Debes ingresar el número de FUA editado.", confirmButtonColor: "#d97706" });
        return;
    }

    const payload = {
        id_cuenta_atencion: datosAtencionActual.id_cuenta_atencion,
        fua_numero_original: datosAtencionActual.fua_numero_original,
        documento_numero: datosAtencionActual.documento_numero,
        nro_historia_clinica: datosAtencionActual.nro_historia_clinica || datosAtencionActual.documento_numero,
        paciente_nombre: datosAtencionActual.paciente_nombre,
        fnacimiento: datosAtencionActual.fnacimiento,
        fua_medico: datosAtencionActual.fua_medico,
        cita_servicio_jamo: datosAtencionActual.cita_servicio_jamo,
        cita_fecha: datosAtencionActual.cita_fecha,
        fua_numero_editado: fuaEditado,
        usuario_registro: usuarioSesion
    };

    btnGuardarFua.disabled = true;
    btnGuardarFua.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;

    try {
        const res = await fetch(`${API_BASE}/fua`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        btnGuardarFua.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1.5"></i> Confirmar y Guardar FUA`;

        if (res.status === 201) {
            cerrarModal();
            Swal.fire({ icon: "success", title: "¡Guardado Exitoso!", text: json.message, timer: 2000, showConfirmButton: false });
            cargarSiguienteFua();
            cargarTablaHoy();
        } else {
            btnGuardarFua.disabled = false;
            Swal.fire({ icon: "error", title: "No se pudo registrar", text: json.message || "Ocurrió un error al guardar el registro.", confirmButtonColor: "#d97706" });
        }
    } catch (err) {
        btnGuardarFua.disabled = false;
        btnGuardarFua.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1.5"></i> Confirmar y Guardar FUA`;
        Swal.fire({ icon: "error", title: "Error", text: "Error de conexión con el backend.", confirmButtonColor: "#d97706" });
    }
}

function verDetalle(index) {
    const item = listaAtencionesHoy[index];
    if (!item) return;

    Swal.fire({
        title: `<span class="text-sm font-bold text-gray-800">Detalle de Atención #${item.id_cuenta_atencion}</span>`,
        html: `
            <div class="text-left text-xs space-y-2 p-2 bg-gray-50 rounded-xl border border-gray-200">
                <p><b>Paciente:</b> <span class="uppercase">${item.paciente_nombre || '---'}</span></p>
                <p><b>DNI / HC:</b> ${item.documento_numero || 'S/D'} / HC: ${item.nro_historia_clinica || item.documento_numero || 'S/D'}</p>
                <p><b>FUA Original:</b> <span class="font-mono">${item.fua_numero_original || '---'}</span></p>
                <p><b>FUA Telesalud:</b> <span class="font-mono font-bold text-amber-700">${item.fua_numero_editado}</span></p>
                <p><b>Médico:</b> <span class="uppercase">${item.fua_medico || '---'}</span></p>
                <p><b>Servicio:</b> <span class="uppercase">${item.cita_servicio_jamo || '---'}</span></p>
                <p><b>Hora Registro:</b> ${item.hora_registro}</p>
                <p><b>Usuario Registro:</b> <span class="uppercase">${item.usuario_registro}</span></p>
            </div>
        `,
        confirmButtonColor: "#d97706",
        confirmButtonText: "Entendido"
    });
}

async function editarFua(idCuenta, fuaActual) {
    const { value: nuevoFua } = await Swal.fire({
        title: `Editar FUA Telesalud`,
        text: `Modificar correlativo para la cuenta #${idCuenta}:`,
        input: 'text',
        inputValue: fuaActual,
        showCancelButton: true,
        confirmButtonText: 'Actualizar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#d97706',
        inputValidator: (value) => {
            if (!value || !value.trim()) return 'El número de FUA es obligatorio';
            const num = parseInt(value.trim(), 10);
            if (isNaN(num) || num < 57000 || num > 60000) return 'El FUA debe estar entre el rango 57000 y 60000';
        }
    });

    if (nuevoFua && nuevoFua.trim() !== fuaActual) {
        try {
            const res = await fetch(`${API_BASE}/fua/${idCuenta}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({
                    fua_numero_editado: nuevoFua.trim(),
                    usuario_registro: usuarioSesion
                })
            });

            const json = await res.json();
            if (res.ok) {
                Swal.fire({ icon: 'success', title: 'Actualizado', text: json.message, timer: 1800, showConfirmButton: false });
                cargarSiguienteFua();
                cargarTablaHoy();
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: json.message, confirmButtonColor: '#d97706' });
            }
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo actualizar.', confirmButtonColor: '#d97706' });
        }
    }
}

async function eliminarFua(idCuenta) {
    const confirm = await Swal.fire({
        title: '¿Liberar FUA?',
        text: `Se eliminará la cuenta #${idCuenta} de Telesalud y el FUA volverá a estar disponible.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        try {
            const res = await fetch(`${API_BASE}/fua/${idCuenta}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            const json = await res.json();

            if (res.ok) {
                Swal.fire({ icon: 'success', title: 'Eliminado', text: json.message, timer: 1800, showConfirmButton: false });
                cargarSiguienteFua();
                cargarTablaHoy();
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: json.message, confirmButtonColor: '#d97706' });
            }
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo eliminar.', confirmButtonColor: '#d97706' });
        }
    }
}