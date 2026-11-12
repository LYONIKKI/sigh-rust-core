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
let insumoSeleccionadoSalida = null;
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

    document.getElementById("tab-btn-salidas").addEventListener("click", () => alternarTab("salidas"));
    document.getElementById("tab-btn-ingresos").addEventListener("click", () => alternarTab("ingresos"));

    // Modales
    document.getElementById("btn-abrir-salida").addEventListener("click", abrirModalSalida);
    document.getElementById("btn-cerrar-salida").addEventListener("click", () => modalSalida.classList.remove("active"));
    document.getElementById("btn-cancelar-salida").addEventListener("click", () => modalSalida.classList.remove("active"));
    document.getElementById("btn-guardar-salida").addEventListener("click", guardarSalida);

    document.getElementById("btn-abrir-ingreso").addEventListener("click", abrirModalIngreso);
    document.getElementById("btn-cerrar-ingreso").addEventListener("click", () => modalIngreso.classList.remove("active"));
    document.getElementById("btn-cancelar-ingreso").addEventListener("click", () => modalIngreso.classList.remove("active"));
    document.getElementById("btn-guardar-ingreso").addEventListener("click", guardarIngreso);

    document.getElementById("btn-cerrar-editar-salida").addEventListener("click", () => modalEditarSalida.classList.remove("active"));
    document.getElementById("btn-cancelar-editar-salida").addEventListener("click", () => modalEditarSalida.classList.remove("active"));
    document.getElementById("btn-guardar-editar-salida").addEventListener("click", guardarEdicionSalida);

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

    // Alternar radio buttons de modo de salida
    const radios = document.getElementsByName("sal-tipo-modo");
    radios.forEach(r => {
        r.addEventListener("change", (e) => {
            if (e.target.value === "FRACCION_DET") {
                document.getElementById("sal-lbl-cantidad").innerText = "Determinaciones a Despachar:";
            } else {
                document.getElementById("sal-lbl-cantidad").innerText = "Empaques Completos a Despachar:";
            }
        });
    });

    await cargarCatalogoInsumos();
    configurarAutocompleteInsumoSalida();
    configurarAutocompletePersonalSalida();
    configurarAutocompletePersonalEdit();
    configurarAutocompleteInsumoIngreso();
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
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-6 text-gray-400">No hay salidas registradas.</td></tr>`;
        } else {
            tbody.innerHTML = registros.map(item => {
                let badgeCant = `<span class="font-black text-gray-800">${item.cantidad} UND</span>`;
                if (item.tipo_despacho === "FRACCION_DET") {
                    badgeCant = `<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-mono font-black text-xs">${item.cantidad} DET</span>`;
                } else if (item.tipo_despacho === "EMPAQUE_COMPLETO") {
                    badgeCant = `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-black text-xs">${item.cantidad} EMPAQUE(S)</span>`;
                }

                return `
                    <tr class="hover:bg-amber-50/40 transition">
                        <td class="py-3 px-4 font-mono font-bold text-gray-600">${item.fecha_hora}</td>
                        <td class="py-3 px-4 font-mono font-bold text-amber-700">${item.insumo_codigo}</td>
                        <td class="py-3 px-4 font-semibold text-gray-900">${item.insumo_descripcion}</td>
                        <td class="py-3 px-4 text-center">${badgeCant}</td>
                        <td class="py-3 px-4 font-bold uppercase text-gray-800">${item.personal_nombre}</td>
                        <td class="py-3 px-4 font-mono text-gray-600">${item.personal_dni}</td>
                        <td class="py-3 px-4 text-gray-600 text-[11px]">${item.personal_area}</td>
                        <td class="py-3 px-4 text-gray-500 text-[11px]">${item.personal_cargo}</td>
                        <td class="py-3 px-4 font-mono text-[11px] text-gray-400 uppercase">${item.usuario_registro}</td>
                        <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
                            <button onclick="verDetalleSalida(${item.id})" class="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition" title="Ver Comprobante">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                            <button onclick="abrirEditarSalida(${item.id})" class="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition" title="Editar Personal Receptor">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button onclick="anularSalida(${item.id}, '${item.insumo_descripcion.replace(/'/g, "\\'")}', ${item.cantidad})" class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition" title="Anular Salida">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join("");
        }
    } else {
        const tbody = document.getElementById("tabla-ingresos-cuerpo");
        if (total === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-400">No hay remesas registradas.</td></tr>`;
        } else {
            tbody.innerHTML = registros.map(item => `
                <tr class="hover:bg-amber-50/40 transition">
                    <td class="py-3 px-4 font-mono font-bold text-gray-600">${item.fecha_registro}</td>
                    <td class="py-3 px-4 font-mono font-bold text-green-700">${item.insumo_codigo}</td>
                    <td class="py-3 px-4 font-semibold text-gray-900">${item.insumo_descripcion}</td>
                    <td class="py-3 px-4 font-mono font-bold text-amber-900">${item.numero_lote}</td>
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

async function cargarCatalogoInsumos() {
    try {
        const res = await fetch(`${API_MOV}/insumos/selector`, { headers: getHeaders() });
        const json = await res.json();
        if (json.status === "success") {
            catalogoInsumos = json.data;
        }
    } catch (_) {}
}

/**
 * Motor genérico de Autocompletado con soporte de flechas y teclado
 */
function enlazarAutocompleteTeclado(input, contenedor, items, onSelectCallback) {
    let indexSeleccionado = -1;

    function renderizar(filtrados) {
        if (filtrados.length === 0) {
            contenedor.innerHTML = `<div class="p-2.5 text-xs text-gray-400">Sin coincidencias</div>`;
            contenedor.classList.remove("hidden");
            return;
        }

        contenedor.innerHTML = filtrados.map((item, idx) => `
            <div class="item-sugerencia p-2.5 hover:bg-amber-50 cursor-pointer border-b border-gray-100 text-xs transition" data-idx="${idx}">
                ${item.html}
            </div>
        `).join("");

        contenedor.querySelectorAll(".item-sugerencia").forEach((el, idx) => {
            el.addEventListener("click", () => {
                onSelectCallback(filtrados[idx].raw);
                cerrar();
            });
        });

        contenedor.classList.remove("hidden");
        indexSeleccionado = -1;
    }

    function resaltar() {
        const divs = contenedor.querySelectorAll(".item-sugerencia");
        divs.forEach((d, i) => {
            if (i === indexSeleccionado) {
                d.classList.add("autocomplete-active");
                d.scrollIntoView({ block: "nearest" });
            } else {
                d.classList.remove("autocomplete-active");
            }
        });
    }

    function cerrar() {
        contenedor.classList.add("hidden");
        indexSeleccionado = -1;
    }

    input.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) { cerrar(); return; }

        const filtrados = items(q);
        renderizar(filtrados);
    });

    input.addEventListener("keydown", (e) => {
        const divs = contenedor.querySelectorAll(".item-sugerencia");
        if (contenedor.classList.contains("hidden") || divs.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            indexSeleccionado = (indexSeleccionado + 1) % divs.length;
            resaltar();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            indexSeleccionado = (indexSeleccionado - 1 + divs.length) % divs.length;
            resaltar();
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
        if (!input.contains(e.target) && !contenedor.contains(e.target)) {
            cerrar();
        }
    });
}

function configurarAutocompleteInsumoSalida() {
    const input = document.getElementById("sal-buscar-insumo");
    const contenedor = document.getElementById("sal-sugerencias-insumo");

    enlazarAutocompleteTeclado(
        input,
        contenedor,
        (q) => {
            return catalogoInsumos
                .filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q))
                .map(i => {
                    let detalleStock = `${i.empaques_disponibles} ${i.presentacion}(S)`;
                    if (i.es_fraccionable && i.det_abiertas_disponibles > 0) {
                        detalleStock += ` + ${i.det_abiertas_disponibles} det. en uso`;
                    }
                    return {
                        raw: i,
                        html: `
                            <p class="font-bold text-gray-900"><span class="font-mono text-amber-700">${i.codigo}</span> - ${i.descripcion}</p>
                            <p class="text-[10px] text-gray-500 font-semibold">${i.presentacion} | Disp: <b class="text-green-700">${detalleStock}</b></p>
                        `
                    };
                });
        },
        (insumo) => {
            insumoSeleccionadoSalida = insumo;
            document.getElementById("sal-insumo-id").value = insumo.id;
            input.value = `${insumo.codigo} - ${insumo.descripcion}`;

            // Mostrar caja con detalle
            const cajaDisp = document.getElementById("sal-caja-disponible");
            let resumen = `${insumo.empaques_disponibles} ${insumo.presentacion}(S) cerrados`;
            if (insumo.es_fraccionable && insumo.det_abiertas_disponibles > 0) {
                resumen += ` y 1 frasco abierto con ${insumo.det_abiertas_disponibles} determinaciones`;
            }
            document.getElementById("sal-disp-detalle").innerText = resumen;
            cajaDisp.classList.remove("hidden");

            // Mostrar selector de determinaciones si es fraccionable
            const bloqueModo = document.getElementById("sal-bloque-tipo-despacho");
            if (insumo.es_fraccionable && insumo.determinaciones_por_empaque > 1) {
                bloqueModo.classList.remove("hidden");
                document.getElementById("sal-label-empaque-entero").innerText = `${insumo.presentacion} Completo (x ${insumo.determinaciones_por_empaque} det.)`;
                document.getElementById("sal-modo-det").checked = true;
                document.getElementById("sal-lbl-cantidad").innerText = "Determinaciones a Despachar:";
            } else {
                bloqueModo.classList.add("hidden");
                document.getElementById("sal-lbl-cantidad").innerText = "Cantidad a Despachar:";
            }

            document.getElementById("sal-cantidad").value = "1";
            document.getElementById("sal-cantidad").focus();
            validarBotonSalida();
        }
    );
}

function configurarAutocompletePersonalSalida() {
    const input = document.getElementById("sal-buscar-personal");
    const contenedor = document.getElementById("sal-sugerencias-personal");

    let listaServidor = [];

    input.addEventListener("input", async (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) { contenedor.classList.add("hidden"); return; }

        try {
            const res = await fetch(`${API_MOV}/personal/buscar?q=${encodeURIComponent(q)}`, { headers: getHeaders() });
            const json = await res.json();
            if (json.status === "success" && json.data.length > 0) {
                listaServidor = json.data;
                const formateados = listaServidor.map(p => ({
                    raw: p,
                    html: `
                        <p class="font-bold text-gray-800 uppercase">${p.nombres}</p>
                        <p class="text-[10px] text-gray-500 font-mono">DNI: ${p.dni} | Área: ${p.area} | Alias: ${p.alias || '---'}</p>
                    `
                }));

                contenedor.innerHTML = formateados.map((item, idx) => `
                    <div class="item-personal p-2.5 hover:bg-amber-50 cursor-pointer border-b border-gray-100 text-xs" data-idx="${idx}">
                        ${item.html}
                    </div>
                `).join("");

                contenedor.querySelectorAll(".item-personal").forEach((el, idx) => {
                    el.addEventListener("click", () => {
                        seleccionarPersonalSalida(formateados[idx].raw);
                        contenedor.classList.add("hidden");
                    });
                });

                contenedor.classList.remove("hidden");
            } else {
                contenedor.classList.add("hidden");
            }
        } catch (_) {}
    });

    let indexPersonal = -1;
    input.addEventListener("keydown", (e) => {
        const divs = contenedor.querySelectorAll(".item-personal");
        if (contenedor.classList.contains("hidden") || divs.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            indexPersonal = (indexPersonal + 1) % divs.length;
            divs.forEach((d, i) => d.classList.toggle("autocomplete-active", i === indexPersonal));
            divs[indexPersonal].scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            indexPersonal = (indexPersonal - 1 + divs.length) % divs.length;
            divs.forEach((d, i) => d.classList.toggle("autocomplete-active", i === indexPersonal));
            divs[indexPersonal].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (indexPersonal >= 0 && indexPersonal < divs.length) {
                divs[indexPersonal].click();
            }
        }
    });

    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !contenedor.contains(e.target)) {
            contenedor.classList.add("hidden");
        }
    });
}

function seleccionarPersonalSalida(p) {
    personalSeleccionado = p;
    document.getElementById("sal-buscar-personal").value = p.nombres;
    document.getElementById("sal-pv-nombre").innerText = p.nombres;
    document.getElementById("sal-pv-dni").innerText = p.dni;
    document.getElementById("sal-pv-area").innerText = p.area;
    document.getElementById("sal-pv-cargo").innerText = p.cargo;
    document.getElementById("sal-preview-personal").classList.remove("hidden");
    validarBotonSalida();
}

function validarBotonSalida() {
    const btn = document.getElementById("btn-guardar-salida");
    btn.disabled = !(insumoSeleccionadoSalida && personalSeleccionado);
}

function abrirModalSalida() {
    document.getElementById("sal-buscar-insumo").value = "";
    document.getElementById("sal-insumo-id").value = "";
    document.getElementById("sal-caja-disponible").classList.add("hidden");
    document.getElementById("sal-bloque-tipo-despacho").classList.add("hidden");
    document.getElementById("sal-cantidad").value = "1";
    document.getElementById("sal-buscar-personal").value = "";
    document.getElementById("sal-preview-personal").classList.add("hidden");
    document.getElementById("btn-guardar-salida").disabled = true;
    insumoSeleccionadoSalida = null;
    personalSeleccionado = null;
    modalSalida.classList.add("active");
    setTimeout(() => document.getElementById("sal-buscar-insumo").focus(), 100);
}

async function guardarSalida() {
    const insumo_id = parseInt(document.getElementById("sal-insumo-id").value, 10);
    const cantidad = parseInt(document.getElementById("sal-cantidad").value, 10);

    let tipo_despacho = "UNIDAD";
    const radioModo = document.querySelector('input[name="sal-tipo-modo"]:checked');
    if (radioModo && insumoSeleccionadoSalida && insumoSeleccionadoSalida.es_fraccionable) {
        tipo_despacho = radioModo.value;
    }

    if (!insumo_id || !cantidad || !personalSeleccionado) {
        Swal.fire({ icon: "warning", title: "Atención", text: "Complete el insumo, la cantidad y el receptor.", confirmButtonColor: "#d97706" });
        return;
    }

    try {
        const res = await fetch(`${API_MOV}/salidas`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                insumo_id,
                cantidad,
                tipo_despacho,
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
            await cargarCatalogoInsumos();
            cargarBandeja();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo procesar la salida.", confirmButtonColor: "#d97706" });
    }
}

function configurarAutocompleteInsumoIngreso() {
    const input = document.getElementById("ing-buscar-insumo");
    const contenedor = document.getElementById("ing-sugerencias-insumo");

    enlazarAutocompleteTeclado(
        input,
        contenedor,
        (q) => {
            return catalogoInsumos
                .filter(i => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q))
                .map(i => ({
                    raw: i,
                    html: `
                        <p class="font-bold text-gray-900"><span class="font-mono text-green-700">${i.codigo}</span> - ${i.descripcion}</p>
                        <p class="text-[10px] text-gray-500 font-semibold">${i.presentacion} (${i.es_fraccionable ? i.determinaciones_por_empaque + ' DET' : 'UNIDAD'})</p>
                    `
                }));
        },
        (insumo) => {
            document.getElementById("ing-insumo-id").value = insumo.id;
            input.value = `${insumo.codigo} - ${insumo.descripcion}`;
            document.getElementById("ing-lote").focus();
        }
    );
}

function abrirModalIngreso() {
    document.getElementById("ing-buscar-insumo").value = "";
    document.getElementById("ing-insumo-id").value = "";
    document.getElementById("ing-lote").value = "";
    document.getElementById("ing-cantidad").value = "1";
    document.getElementById("ing-fecha-ingreso").value = new Date().toISOString().split("T")[0];
    document.getElementById("ing-fecha-vencimiento").value = "";
    modalIngreso.classList.add("active");
    setTimeout(() => document.getElementById("ing-buscar-insumo").focus(), 100);
}

async function guardarIngreso() {
    const insumo_id = parseInt(document.getElementById("ing-insumo-id").value, 10);
    const numero_lote = document.getElementById("ing-lote").value.trim().toUpperCase();
    const cantidad = parseInt(document.getElementById("ing-cantidad").value, 10);
    const fecha_ingreso = document.getElementById("ing-fecha-ingreso").value;
    const fecha_vencimiento = document.getElementById("ing-fecha-vencimiento").value || null;

    if (!insumo_id || !numero_lote || !cantidad || !fecha_ingreso) {
        Swal.fire({ icon: "warning", title: "Faltan Datos", text: "Insumo, lote, cantidad y fecha de ingreso son obligatorios.", confirmButtonColor: "#d97706" });
        return;
    }

    if (fecha_vencimiento && fecha_ingreso > fecha_vencimiento) {
        Swal.fire({ icon: "warning", title: "Inconsistencia de Fechas", text: "La caducidad no puede ser anterior al ingreso.", confirmButtonColor: "#d97706" });
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
            await cargarCatalogoInsumos();
            cargarBandeja();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de red", text: "No se pudo procesar el ingreso.", confirmButtonColor: "#d97706" });
    }
}

function configurarAutocompletePersonalEdit() {
    const input = document.getElementById("edit-sal-buscar-personal");
    const contenedor = document.getElementById("edit-sal-sugerencias-personal");

    input.addEventListener("input", async (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) { contenedor.classList.add("hidden"); return; }
        try {
            const res = await fetch(`${API_MOV}/personal/buscar?q=${encodeURIComponent(q)}`, { headers: getHeaders() });
            const json = await res.json();
            if (json.status === "success" && json.data.length > 0) {
                contenedor.innerHTML = json.data.map(p => `
                    <div class="item-edit-p p-2.5 hover:bg-amber-50 cursor-pointer border-b border-gray-100 text-xs" onclick='seleccionarPersonalEdit(${JSON.stringify(p)})'>
                        <p class="font-bold text-gray-800 uppercase">${p.nombres}</p>
                        <p class="text-[10px] text-gray-500 font-mono">DNI: ${p.dni} | Área: ${p.area}</p>
                    </div>
                `).join("");
                contenedor.classList.remove("hidden");
            } else {
                contenedor.classList.add("hidden");
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
    document.getElementById("edit-sal-lbl-cantidad").innerText = item.tipo_despacho === "FRACCION_DET"
        ? "Determinaciones Despachadas:"
        : "Cantidad Despachada:";
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
        Swal.fire({ icon: "warning", title: "Datos Inválidos", text: "Verifique la cantidad y el personal receptor.", confirmButtonColor: "#d97706" });
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
            await cargarCatalogoInsumos();
            cargarBandeja();
        } else {
            Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
        }
    } catch (_) {
        Swal.fire({ icon: "error", title: "Error de Red", text: "No se pudo actualizar la salida.", confirmButtonColor: "#d97706" });
    }
}

window.anularSalida = async function(id, descripcion, cantidad) {
    const confirm = await Swal.fire({
        title: "¿Anular Salida?",
        html: `¿Desea anular el despacho de <b>${cantidad}</b> de <i>${descripcion}</i>?<br><br><span class="text-xs text-green-700 font-bold">El stock se devolverá automáticamente al lote de procedencia.</span>`,
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
                await cargarCatalogoInsumos();
                cargarBandeja();
            } else {
                Swal.fire({ icon: "error", title: "Error", text: json.message, confirmButtonColor: "#d97706" });
            }
        } catch (_) {
            Swal.fire({ icon: "error", title: "Error de Red", text: "No se pudo anular la salida.", confirmButtonColor: "#d97706" });
        }
    }
};

const modalDetSalida = document.getElementById("modal-detalle-salida");
document.getElementById("btn-cerrar-det-salida").addEventListener("click", () => modalDetSalida.classList.remove("active"));
document.getElementById("btn-cerrar-det-salida-pie").addEventListener("click", () => modalDetSalida.classList.remove("active"));

window.verDetalleSalida = function(id) {
    const item = listaMovimientos.find(m => m.id === id);
    if (!item) return;

    document.getElementById("dt-sal-codigo").innerText = item.insumo_codigo;
    document.getElementById("dt-sal-descripcion").innerText = item.insumo_descripcion;
    document.getElementById("dt-sal-cantidad").innerText = `${item.cantidad} ${item.tipo_despacho === 'FRACCION_DET' ? 'DETERMINACIONES' : 'EMPAQUES'}`;
    document.getElementById("dt-sal-modalidad").innerText = item.tipo_despacho === 'FRACCION_DET' ? 'USO POR DETERMINACIONES' : 'EMPAQUE COMPLETO';
    document.getElementById("dt-sal-fecha").innerText = item.fecha_hora;

    document.getElementById("dt-sal-receptor").innerText = item.personal_nombre;
    document.getElementById("dt-sal-dni").innerText = item.personal_dni;
    document.getElementById("dt-sal-area").innerText = item.personal_area;
    document.getElementById("dt-sal-cargo").innerText = item.personal_cargo;
    document.getElementById("dt-sal-usuario").innerText = item.usuario_registro;

    modalDetSalida.classList.add("active");
};