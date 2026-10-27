// /var/www/html/sigh_rust/public/js/sidebar.js
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. CARGA MODULAR DEL SIDEBAR
        const sidebarContainer = document.getElementById('sidebar-container');
        if (sidebarContainer) {
            const respSidebar = await fetch('../views/layout/sidebar.html');
            if (respSidebar.ok) {
                sidebarContainer.innerHTML = await respSidebar.text();

                // Resaltar enlace según URL
                const currentPath = window.location.pathname;
                const sidebarLinks = sidebarContainer.querySelectorAll('nav a');
                sidebarLinks.forEach(link => {
                    link.classList.remove('item-active-lucuma');
                    link.classList.add('item-inactive-white', 'item-hover-lucuma');
                    const linkHref = link.getAttribute('href');
                    if (linkHref && currentPath.endsWith(linkHref.split('/').pop())) {
                        link.classList.add('item-active-lucuma');
                        link.classList.remove('item-inactive-white', 'item-hover-lucuma');
                    }
                });
            }
        }

        // 2. CARGA MODULAR DEL FOOTER
        const footerContainer = document.getElementById('footer-container');
        if (footerContainer) {
            const respFooter = await fetch('../views/layout/footer.html');
            if (respFooter.ok) {
                footerContainer.innerHTML = await respFooter.text();
            }
        }

        // 3. CONSULTAR SESIÓN PHP
        const responseSession = await fetch('../session_info.php');
        if (!responseSession.ok) {
            window.location.href = '/login.php?error=sesion_expirada';
            return;
        }

        const data = await responseSession.json();
        const rol = (data.rol || '').toLowerCase().trim();

        // 4. DATOS DE USUARIO EN CABECERA Y FOOTER DEL SIDEBAR
        const initials = data.usuario ? data.usuario.substring(0, 2).toUpperCase() : 'US';
        const elInitials = document.getElementById('user-initials');
        const elFullname = document.getElementById('user-fullname');
        const elRoleLabel = document.getElementById('user-role-label');
        const elTituloBienvenida = document.getElementById('titulo-bienvenida');
        const elBadgeRol = document.getElementById('badge-rol');

        if (elInitials) elInitials.innerText = initials;
        if (elFullname) elFullname.innerText = data.usuario;
        if (elRoleLabel) elRoleLabel.innerText = data.rol;
        if (elTituloBienvenida) elTituloBienvenida.innerText = `Bienvenido, ${data.usuario}`;
        if (elBadgeRol) elBadgeRol.innerText = `Rol: ${data.rol.toUpperCase()}`;

        // 5. CONTROL DE ACCESO (ACL) CON MENÚS FIJOS
        const secTelesalud = document.getElementById('acc-telesalud-resumen');
        const secLaboratorio = document.getElementById('acc-laboratorio-insumos');
        const secAdmin = document.getElementById('acc-telesalud-admin');

        const esAdmin = (rol === 'admin_rust' || rol === 'admin' || rol === 'administrador');
        const esTelesalud = (rol === 'telesalud_rust');
        const esLab = (rol === 'lab_rust');

        const fijarAbierto = (elemento) => {
            if (!elemento) return;
            elemento.style.display = 'block';
            elemento.setAttribute('open', '');
            const summary = elemento.querySelector('summary');
            if (summary) {
                summary.addEventListener('click', (e) => e.preventDefault());
                const icono = summary.querySelector('i');
                if (icono) icono.style.display = 'none';
            }
        };

        if (esAdmin) {
            fijarAbierto(secTelesalud);
            fijarAbierto(secLaboratorio);
            fijarAbierto(secAdmin);
        } else if (esTelesalud) {
            fijarAbierto(secTelesalud);
        } else if (esLab) {
            fijarAbierto(secLaboratorio);
        }

        // 6. PROTECCIÓN DE NAVEGACIÓN
        const rutaActual = window.location.pathname;
        if (rutaActual.includes('telesalud.html') && !esAdmin && !esTelesalud) {
            window.location.href = '/sigh_rust/public/views/dashboard.html?error=no_autorizado';
        }
        if (rutaActual.includes('insumos.html') && !esAdmin && !esLab) {
            window.location.href = '/sigh_rust/public/views/dashboard.html?error=no_autorizado';
        }
        if (rutaActual.includes('usuarios.html') && !esAdmin) {
            window.location.href = '/sigh_rust/public/views/dashboard.html?error=no_autorizado';
        }

        // 7. INYECTAR Y BLINDAR AUTORÍA DESDE RUST
        try {
            const respCreditos = await fetch('http://172.16.10.240:4000/api/system/creditos');
            if (respCreditos.ok) {
                const cred = await respCreditos.json();
                const elFirma = document.getElementById('txt-autoria-rust');
                const elYear = document.getElementById('txt-year-rust');

                if (elFirma && cred.autor) {
                    elFirma.innerText = cred.autor;

                    // Bloqueo contra alteración por consola / DevTools
                    const observer = new MutationObserver(() => {
                        if (elFirma.innerText !== cred.autor) {
                            elFirma.innerText = cred.autor;
                        }
                    });
                    observer.observe(elFirma, { childList: true, characterData: true, subtree: true });
                }

                if (elYear && cred.year) {
                    elYear.innerHTML = `&copy; ${cred.year}`;
                }
            }
        } catch (e) {
            console.warn("No se pudo cargar la firma del núcleo.");
        }

    } catch (error) {
        console.error("Error cargando el layout:", error);
        window.location.href = '/login.php';
    }
});