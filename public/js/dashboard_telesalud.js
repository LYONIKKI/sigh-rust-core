// public/js/dashboard_telesalud.js

const API_BASE = "http://172.16.10.240:4000/api/telesalud/dashboard";
window.rolSesion = window.rolSesion || "admin_rust";

let listaHistorial = [];
let listaFiltrada = [];
let paginaActual = 1;
const filasPorPagina = 12;

// Elementos del DOM
const inputDesde = document.getElementById("filtro-desde");
const inputHasta = document.getElementById("filtro-hasta");
const btnFiltrarFechas = document.getElementById("btn-filtrar-fechas");
const filtroSearch = document.getElementById("filtro-search");

// Modal Rastreo
const modalRastreo = document.getElementById("modal-rastreo");
const btnAbrirRastreo = document.getElementById("btn-abrir-rastreo");
const btnCerrarRastreo = document.getElementById("btn-cerrar-rastreo");
const btnCerrarRastreoPie = document.getElementById("btn-cerrar-rastreo-pie");
const inputFuaBuscar = document.getElementById("input-fua-buscar");
const btnEjecutarRastreo = document.getElementById("btn-ejecutar-rastreo");
const resultadoRastreo = document.getElementById("resultado-rastreo");

function getHeaders() {
    return {
        "Content-Type": "application/json",
        "X-User-Role": window.rolSesion
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const resp = await fetch("/sigh_rust/public/session_info.php");
        if (resp.ok) {
            const sess = await resp.json();
            if (sess && sess.rol) window.rolSesion = sess.rol.toLowerCase().trim();
        }
    } catch (_) {}

    // Rango inicial: primer día del mes actual hasta hoy
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    
    inputDesde.value = primerDia.toISOString().split("T")[0];
    inputHasta.value = hoy.toISOString().split("T")[0];

    cargarHistorial();

    btnFiltrarFechas.addEventListener("click", cargarHistorial);

    filtroSearch.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        listaFiltrada = listaHistorial.filter(item => {
            const paciente = (item.paciente_nombre || "").toLowerCase();
            const cuenta = String(item.id_cuenta_atencion || "");
            const hc = String(item.nro_historia_clinica || "");
            const fuaAtenc = String(item.fua_numero_original || "");
            const fuaFarm = String(item.fua_farmacia || "");
            const fuaLab = String(item.fua_laboratorio || "");
            const fuaImg = String(item.fua_imagenes || "");

            return paciente.includes(q) || cuenta.includes(q) || hc.includes(q) ||
                   fuaAtenc.includes(q) || fuaFarm.includes(q) || fuaLab.includes(q) || fuaImg.includes(q);
        });
        paginaActual = 1;
        renderizarTabla();
    });

    // Eventos Modal Rastreo
    btnAbrirRastreo.addEventListener("click", () => {
        inputFuaBuscar.value = "";
        resultadoRastreo.classList.add("hidden");
        modalRastreo.classList.add("active");
        modalRastreo.classList.remove("hidden");
        setTimeout(() => inputFuaBuscar.focus(), 100);
    });

    const cerrarRastreo = () => {
        modalRastreo.classList.remove("active");
        modalRastreo.classList.add("hidden");
    };

    btnCerrarRastreo.addEventListener("click", cerrarRastreo);
    btnCerrarRastreoPie.addEventListener("click", cerrarRastreo);

    inputFuaBuscar.addEventListener("keypress", (e) => {
        if (e.key === "Enter") ejecutarRastreo();
    });
    btnEjecutarRastreo.addEventListener("click", ejecutarRastreo);
});

async function cargarHistorial() {
    const tbody = document.getElementById("tabla-historial-cuerpo");
    const desde = inputDesde.value;
    const hasta = inputHasta.value;

    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Consultando historial...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/historial?desde=${desde}&hasta=${hasta}`, { headers: getHeaders() });
        const json = await res.json();

        if (json.status === "success") {
            listaHistorial = json.data;
            listaFiltrada = [...listaHistorial];
            document.getElementById("card-total-registros").innerText = json.total;
            paginaActual = 1;
            renderizarTabla();
        } else {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-500">${json.message}</td></tr>`;
        }
    } catch (_) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-500">Error al comunicar con el servidor Rust.</td></tr>`;
    }
}

function renderizarTabla() {
    const tbody = document.getElementById("tabla-historial-cuerpo");
    const total = listaFiltrada.length;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-gray-400">No se encontraron atenciones en el rango seleccionado.</td></tr>`;
        document.getElementById("info-paginacion").innerText = "Mostrando 0 de 0 registros";
        document.getElementById("controles-paginacion").innerHTML = "";
        return;
    }

    const totalPaginas = Math.ceil(total / filasPorPagina) || 1;
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const registros = listaFiltrada.slice(inicio, fin);

    tbody.innerHTML = registros.map(item => `
        <tr class="hover:bg-amber-50/40 transition">
            <td class="py-3 px-3 font-mono font-bold text-gray-500">${item.fecha_registro}</td>
            <td class="py-3 px-3 font-bold text-gray-800">${item.id_cuenta_atencion}</td>
            <td class="py-3 px-3 font-semibold text-gray-900 uppercase">${item.paciente_nombre || '---'}</td>
            <td class="py-3 px-3 font-mono text-gray-600">${item.nro_historia_clinica || '---'}</td>
            <td class="py-3 px-3"><span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-mono font-bold">${item.fua_numero_original || '---'}</span></td>
            <td class="py-3 px-3 font-mono text-emerald-700 font-semibold">${item.fua_farmacia || '---'}</td>
            <td class="py-3 px-3 font-mono text-blue-700 font-semibold">${item.fua_laboratorio || '---'}</td>
            <td class="py-3 px-3 font-mono text-purple-700 font-semibold">${item.fua_imagenes || '---'}</td>
            <td class="py-3 px-3 text-gray-500 uppercase text-[11px]">${item.usuario_registro}</td>
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

async function ejecutarRastreo() {
    const fua = inputFuaBuscar.value.trim();
    if (!fua) {
        Swal.fire({ icon: "warning", title: "Atención", text: "Ingresa el número de FUA a buscar.", confirmButtonColor: "#d97706" });
        return;
    }

    btnEjecutarRastreo.disabled = true;
    btnEjecutarRastreo.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

    try {
        const res = await fetch(`${API_BASE}/rastrear/${encodeURIComponent(fua)}`, { headers: getHeaders() });
        const json = await res.json();

        btnEjecutarRastreo.disabled = false;
        btnEjecutarRastreo.innerHTML = `<i class="fa-solid fa-magnifying-glass mr-1.5"></i><span>Rastrear</span>`;

        if (res.ok && json.status === "success") {
            const d = json.data;
            document.getElementById("rt-cuenta").innerText = d.id_cuenta_atencion;
            document.getElementById("rt-badge-tipo").innerText = d.tipo_fua_coincidente;
            document.getElementById("rt-paciente").innerText = d.paciente_nombre || "---";
            document.getElementById("rt-doc").innerText = `${d.documento_numero || 'S/D'} / HC: ${d.nro_historia_clinica || 'S/D'}`;
            document.getElementById("rt-fnac").innerText = d.fnacimiento || "---";
            document.getElementById("rt-medico").innerText = d.fua_medico || "---";
            document.getElementById("rt-servicio").innerText = `${d.cita_servicio_jamo || 'Consulta Externa'} (${d.cita_fecha || 'Sin fecha'})`;
            
            document.getElementById("rt-fua-atencion").innerText = d.fua_numero_original || "Sin FUA original";
            document.getElementById("rt-fua-farmacia").innerText = d.fua_farmacia || "No emitido";
            document.getElementById("rt-fua-lab").innerText = d.fua_laboratorio || "No emitido";
            document.getElementById("rt-fua-img").innerText = d.fua_imagenes || "No emitido";
            
            document.getElementById("rt-usuario").innerText = d.usuario_registro;
            document.getElementById("rt-fecha-registro").innerText = d.fecha_registro;

            resultadoRastreo.classList.remove("hidden");
        } else {
            resultadoRastreo.classList.add("hidden");
            Swal.fire({ icon: "info", title: "Sin Resultados", text: json.message || "El número de FUA no existe en el sistema.", confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        btnEjecutarRastreo.disabled = false;
        btnEjecutarRastreo.innerHTML = `<i class="fa-solid fa-magnifying-glass mr-1.5"></i><span>Rastrear</span>`;
        Swal.fire({ icon: "error", title: "Error", text: "Error de red al consultar el FUA.", confirmButtonColor: "#d97706" });
    }
}