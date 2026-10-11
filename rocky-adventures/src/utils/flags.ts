// Parámetros de URL para pruebas y diagnóstico.
//   ?lowfx  → renderizado mínimo (sin hierba, sin sombras, resolución muy baja) para pruebas automáticas
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
export const LOW_FX = params.has('lowfx')
