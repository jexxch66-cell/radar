// Aplica el tema guardado antes de pintar para evitar el parpadeo claro->oscuro.
// Vive en un archivo propio (y no en linea dentro de index.html) para que la Content-Security-Policy
// pueda prohibir los scripts en linea sin romper esta funcion.
try {
  var t = localStorage.getItem('radar_theme');
  if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
