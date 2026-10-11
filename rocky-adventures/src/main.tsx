import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/fredoka/400.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/baloo-2/800.css'
import './ui/styles.css'

const params = new URLSearchParams(location.search)
const RockyViewer = lazy(() => import('./dev/RockyViewer'))
const App = lazy(() => import('./App'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{params.get('viewer') === 'rocky' ? <RockyViewer /> : <App />}</Suspense>
  </StrictMode>,
)
