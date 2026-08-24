'use strict';

export function toast(message, type = 'info') {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

export function openModal({ title, bodyHtml, size = '', onMount, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${size === 'lg' ? 'modal-lg' : ''}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" aria-label="Fermer">&times;</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;

  const body = overlay.querySelector('.modal-body');
  if (typeof bodyHtml === 'string') {
    body.innerHTML = bodyHtml;
  } else if (bodyHtml instanceof Node) {
    body.appendChild(bodyHtml);
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
    if (onClose) onClose();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);

  document.body.appendChild(overlay);
  if (onMount) onMount(overlay, close);

  return { overlay, close };
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    let decided = false;
    const decide = (value) => {
      if (decided) return;
      decided = true;
      resolve(value);
    };

    openModal({
      title: 'Confirmation',
      bodyHtml: `
        <p style="margin-bottom:20px;color:var(--text)">${message}</p>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button class="btn btn-secondary" id="confirmCancel">Annuler</button>
          <button class="btn btn-danger" id="confirmOk">Confirmer</button>
        </div>
      `,
      onMount: (overlay, close) => {
        overlay.querySelector('#confirmCancel').addEventListener('click', () => { decide(false); close(); });
        overlay.querySelector('#confirmOk').addEventListener('click', () => { decide(true); close(); });
      },
      onClose: () => decide(false),
    });
  });
}
