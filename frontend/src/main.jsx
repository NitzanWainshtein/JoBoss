import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { registerServiceWorker } from './utils/registerServiceWorker.js'
import './styles/global.css'
import { Amplify } from 'aws-amplify'
import awsConfig from './awsConfig'

Amplify.configure(awsConfig)
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
