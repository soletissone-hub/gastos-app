// Categorías que coinciden exactamente con GASTOS_HOGAR
const CATEGORIES = {
  variable: {
    label: 'Variable', icon: '💳', color: '#378ADD',
    keywords: ['mcdonald','burger','pizza','sushi','resto','restaurante','cafe','cafeteria',
      'starbucks','fonda','tacos','kebab','subway','kfc','dominos','rappi','uber eats','pedidos ya',
      'verduleria','almacen','farmacia','ferreteria','kiosco','estacion','shell','ypf','bp',
      'nafta','gasolina','combustible','ropa','zapatillas','calzado','zara','hm','adidas','nike',
      'peluqueria','tintoreria','lavanderia','taxi','remis','estacionamiento','parking','cochera',
      'uber','cabify','didi','colectivo','subte','tren','bus','boleto','efectivo','manual',
      'minimarket','tienda','negocio','compra','pago','salida','salidas']
  },
  supermercado: {
    label: 'Supermercado', icon: '🛒', color: '#639922',
    keywords: ['carrefour','walmart','coto','jumbo','dia','lidl','aldi','disco','vea',
      'changomas','la anonima','mercadona','maxiconsumo','cooperativa','supermercado','super']
  },
  servicio: {
    label: 'Servicio', icon: '🔌', color: '#D85A30',
    keywords: ['edenor','naturgy','flow','fibertel','personal flow','movistar','claro','personal',
      'tuenti','arnet','speedy','telecentro','cablevision','directv','expensas','gabsa',
      'luz','gas','agua','internet','cable','wifi','telefono','celular','seguro',
      'osde','swiss medical','medife','galeno','alqui','renta']
  },
  recurrente: {
    label: 'Recurrente', icon: '🔄', color: '#1D9E75',
    keywords: ['lucia','empleada','domestica','jardinero','paseador','piletero','mantenimiento',
      'niñera','baby','cuidadora','limpieza','porteria','casero','vigilancia','seguridad']
  },
  impuesto: {
    label: 'Impuesto', icon: '🏛️', color: '#BA7517',
    keywords: ['arba','afip','arca','agip','rentas','impuesto','tasa','patente','monotributo',
      'ganancias','iva','ingresos brutos','municipal','habilitacion','multa','infraccion',
      'abogado','escribano','escribania','honorarios']
  },
  entretenimiento: {
    label: 'Entretenimiento', icon: '🎮', color: '#D4537E',
    keywords: ['netflix','spotify','hbo','disney','prime','youtube','twitch','steam',
      'playstation','xbox','cine','teatro','concierto','show','evento','entrada','museo',
      'parque','juego','videojuego','boliche','fiesta','bar','club','discoteca','recital',
      'viaje','hotel','airbnb','booking','vuelo','aerolinea','aeropuerto']
  },
  salud: {
    label: 'Salud', icon: '🏥', color: '#7F77DD',
    keywords: ['medico','doctor','hospital','clinica','consulta','turno','laboratorio',
      'analisis','dentista','odontologo','psicologo','terapeuta','fisio','kinesiologo',
      'optica','lentes','farmacia','medicamento','remedio','vitamina','gym','pilates',
      'yoga','natacion','ortopedia','veterinaria','veterinario']
  },
  educacion: {
    label: 'Educacion', icon: '📚', color: '#534AB7',
    keywords: ['jardin','colegio','escuela','universidad','facultad','curso','libro',
      'libreria','cuaderno','material','udemy','coursera','platzi','academia',
      'clases','profesor','tutor','carrera','posgrado','master','ta te ti','santa teresa',
      'santa cecilia','instituto','idioma','ingles','tutoria']
  },
  otros: {
    label: 'Otros', icon: '📦', color: '#888780',
    keywords: []
  }
};

const HOGARES = [
  { key: 'SMDT',         label: 'SMDT',        color: '#e8f0fe', border: '#c5d4f8' },
  { key: 'Mendoza',      label: 'Mendoza',     color: '#fef3e8', border: '#f8d4a0' },
  { key: 'Bella Vista',  label: 'Bella Vista', color: '#e8fee8', border: '#a0d4a0' },
  { key: 'General',      label: 'General',     color: '#f5f5f5', border: '#ddd' }
];

function classify(description) {
  if (!description) return 'variable';
  const text = description.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  let bestKey = 'variable';
  let bestScore = 0;

  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (key === 'otros') continue;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) {
        const score = kw.length;
        if (score > bestScore) { bestScore = score; bestKey = key; }
      }
    }
  }
  return bestKey;
}

function getCategoryInfo(key) {
  return CATEGORIES[key] || CATEGORIES.variable;
}

function getAllCategories() {
  return Object.entries(CATEGORIES).map(([key, cat]) => ({ key, ...cat }));
}

function getAllHogares() {
  return HOGARES;
}

if (typeof module !== 'undefined') {
  module.exports = { classify, getCategoryInfo, getAllCategories, getAllHogares, CATEGORIES, HOGARES };
}
