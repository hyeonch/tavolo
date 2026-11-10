import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import { App } from './App';
import { OAuthConsent } from './auth/OAuthConsent';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    {window.location.pathname === '/oauth/consent' ? <OAuthConsent /> : <App />}
    <Analytics />
    <SpeedInsights />
  </StrictMode>
);
