// Caché de la malla esculpida: se genera una sola vez por nivel de detalle y sesión.
import type { RockyMeshData } from './mesher.ts'

const cache = new Map<number, Promise<RockyMeshData>>()

export function cellSizeForQuality(q: 'low' | 'medium' | 'high'): number {
  return q === 'high' ? 0.005 : q === 'medium' ? 0.0062 : 0.0085
}

export function loadRockyMesh(cellSize: number): Promise<RockyMeshData> {
  let p = cache.get(cellSize)
  if (p) return p
  p = new Promise<RockyMeshData>((resolve, reject) => {
    try {
      const worker = new Worker(new URL('./rocky.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (ev: MessageEvent<RockyMeshData>) => {
        resolve(ev.data)
        worker.terminate()
      }
      worker.onerror = (err) => {
        worker.terminate()
        // Respaldo: generación en el hilo principal
        import('./mesher.ts').then((m) => resolve(m.generateRockyMesh(cellSize))).catch(() => reject(err))
      }
      worker.postMessage({ cellSize })
    } catch {
      import('./mesher.ts').then((m) => resolve(m.generateRockyMesh(cellSize))).catch(reject)
    }
  })
  cache.set(cellSize, p)
  return p
}
