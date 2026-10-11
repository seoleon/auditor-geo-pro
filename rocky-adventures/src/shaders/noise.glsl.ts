// Ruido procedural compartido por varios shaders (valor 3D + fbm).
export const NOISE_GLSL = /* glsl */ `
float rk_hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float rk_vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = rk_hash13(i);
  float n100 = rk_hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = rk_hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = rk_hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = rk_hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = rk_hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = rk_hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = rk_hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float rk_fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * rk_vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
`
