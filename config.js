/* ============================================================
   CONFIGURACIÓN — edita estos valores con los tuyos
   ============================================================ */

// 1) FIREBASE — cópialo desde Firebase Console > Configuración del proyecto > Tus apps > SDK setup
const firebaseConfig = {

  apiKey: "AIzaSyBz9VDD17ZiieA9lkSViIZts7TiYE2a4yE",

  authDomain: "crud-85196.firebaseapp.com",

  databaseURL: "https://crud-85196-default-rtdb.firebaseio.com",

  projectId: "crud-85196",

  storageBucket: "crud-85196.firebasestorage.app",

  messagingSenderId: "340343732832",

  appId: "1:340343732832:web:af3aaddbef9d5c3a092105"

};


// 2) CLOUDINARY — para subir imágenes gratis desde el navegador
//    cloudName: lo ves en tu dashboard de Cloudinary (arriba a la izquierda)
//    uploadPreset: créalo en Settings > Upload > Upload presets > Add upload preset
//                  IMPORTANTE: marca el modo como "Unsigned"
const cloudinaryConfig = {
  cloudName: "duduz1ehw",
  uploadPreset: "tienda"
};

// 3) TIENDA — datos de tu negocio
const storeConfig = {
  nombre: "Variedades-ViVi",
  whatsappNumero: "573017046571", // código de país + número, sin + ni espacios
  moneda: "COP",
  simboloMoneda: "$"
};
