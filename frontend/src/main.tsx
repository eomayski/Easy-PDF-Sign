import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './store';
import { App } from './App';
import { clearOAuthTabMarker, isOAuthCallbackTab, waitForOAuthSession } from './lib/oauthTab';
import i18n from './i18n';
import './styles/index.css';

const root = document.getElementById('root')!;

function renderApp() {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </React.StrictMode>,
  );
}

/** Едноредово съобщение в таба за вписване — без React, без pdf.js. */
function showTabNotice(message: string) {
  root.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = message;
  p.style.cssText =
    'margin:4rem auto;max-width:26rem;padding:0 1rem;text-align:center;color:#475569;font-size:0.95rem';
  root.appendChild(p);
}

async function bootstrap() {
  // Табът, отворен за Google вписването: разменя токена и се затваря сам.
  // Сесията стига до оригиналния таб през BroadcastChannel-а на supabase-js.
  if (isOAuthCallbackTab()) {
    clearOAuthTabMarker();
    showTabNotice(i18n.t('auth.tabSigningIn'));
    const signedIn = await waitForOAuthSession();
    if (signedIn) {
      showTabNotice(i18n.t('auth.tabDone'));
      window.close();
      // Ако браузърът откаже да затвори таба, съобщението остава видимо.
      return;
    }
    // Неуспех/отказ — показваме нормалното приложение, за да не остане празен таб.
  }
  renderApp();
}

void bootstrap();
