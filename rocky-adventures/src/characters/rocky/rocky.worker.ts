// Web Worker: esculpe la malla de Rocky sin bloquear el hilo principal.
import { generateRockyMesh } from './mesher.ts'

self.onmessage = (ev: MessageEvent<{ cellSize: number }>) => {
  const data = generateRockyMesh(ev.data.cellSize)
  const transfer = [
    data.positions.buffer, data.normals.buffer, data.indices.buffer,
    data.skinIndex.buffer, data.skinWeight.buffer, data.mask.buffer, data.mask2.buffer,
  ]
  ;(self as unknown as Worker).postMessage(data, transfer)
}
