// Exporta el Rocky procedural (malla + esqueleto con nombres compatibles) a GLB, como base para
// esculpir/texturizar en Blender a partir de fotos. Uso: npm run export:rocky [salida.glb]
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { writeFileSync } from 'node:fs'
import { generateRockyMesh } from '../src/characters/rocky/mesher.ts'
import { BONES } from '../src/characters/rocky/anatomy.ts'
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.() }) } readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.() }) } }
const m = generateRockyMesh(0.006)
const geo = new THREE.BufferGeometry()
geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3))
geo.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4))
geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4))
geo.setIndex(new THREE.BufferAttribute(m.indices, 1))
const bones = {}, list = []
for (const d of BONES) {
  const b = new THREE.Bone(); b.name = d.name
  const p = d.parent ? BONES.find((x) => x.name === d.parent) : null
  b.position.set(d.head[0] - (p ? p.head[0] : 0), d.head[1] - (p ? p.head[1] : 0), d.head[2] - (p ? p.head[2] : 0))
  if (d.parent) bones[d.parent].add(b)
  bones[d.name] = b; list.push(b)
}
const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.8 }))
mesh.add(bones.root)
mesh.bind(new THREE.Skeleton(list))
const scene = new THREE.Scene(); scene.add(mesh)
const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
writeFileSync(process.argv[2] ?? 'rocky-base.glb', Buffer.from(glb))
console.log('GLB escrito', process.argv[2] ?? 'rocky-base.glb', glb.byteLength, 'bytes')
