// public/js/tema.js
//
// Aplica un tema visual distinto segun la hora local del dispositivo de
// quien esta viendo la pagina:
//   06:00 - 12:59  -> "dia"   (claro)
//   13:00 - 18:59  -> "tarde" (calido)
//   19:00 - 05:59  -> "noche" (oscuro, el tema original)
//
// Se aplica como atributo data-theme en <html>, y el archivo css/style.css
// define las variables de color para cada uno. Este script se carga con
// <script> normal (no defer) en el <head>, antes de que se pinte la pagina,
// para que no haya parpadeo del tema equivocado por una fraccion de segundo.

(function aplicarTemaSegunHora() {
  const hora = new Date().getHours();
  let tema;

  if (hora >= 6 && hora < 13) {
    tema = 'dia';
  } else if (hora >= 13 && hora < 19) {
    tema = 'tarde';
  } else {
    tema = 'noche';
  }

  document.documentElement.setAttribute('data-theme', tema);
})();
