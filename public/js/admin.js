// Ayudas del panel de administración (todo funciona igual sin JavaScript, salvo el achicado de fotos).
(function () {
  'use strict';

  // Confirmación antes de acciones que no se pueden deshacer.
  document.addEventListener('submit', function (e) {
    var texto = e.target.getAttribute('data-confirmar');
    if (texto && !window.confirm(texto)) e.preventDefault();
  });

  // Achica las fotos en el celular/computadora antes de subirlas (máx. 800 px, JPG calidad 80).
  // Así el menú carga rápido aunque la foto original pese varios MB.
  var MAX = 800;
  Array.prototype.forEach.call(document.querySelectorAll('input[type="file"][data-achicar]'), function (input) {
    input.addEventListener('change', function () {
      var archivo = input.files && input.files[0];
      if (!archivo || !/^image\//.test(archivo.type) || !window.createImageBitmap || !window.DataTransfer) return;
      createImageBitmap(archivo)
        .then(function (img) {
          var escala = Math.min(1, MAX / Math.max(img.width, img.height));
          if (escala === 1 && archivo.size < 400 * 1024) return;
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', 0.8); });
        })
        .then(function (blob) {
          if (!blob) return;
          var dt = new DataTransfer();
          dt.items.add(new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
          input.files = dt.files;
        })
        .catch(function () { /* si falla, se sube la original */ });
    });
  });
})();
