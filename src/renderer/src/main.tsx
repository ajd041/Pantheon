import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import '@fontsource/gfs-didot'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import '@fontsource-variable/caveat'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
