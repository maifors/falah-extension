'use strict';

chrome.storage.sync.get('user_classifications', ({ user_classifications = {} }) => {
  const tbody = document.querySelector('tbody');
  if (!tbody) return;

  const entries = Object.entries(user_classifications);
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:20px">No custom classifications yet. Visit any site to classify it.</td></tr>';
    return;
  }

  entries.forEach(([domain, data]) => {
    const tr = document.createElement('tr');

    const tdDomain = document.createElement('td');
    tdDomain.textContent = domain; // textContent — XSS safe

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${data.status}`;
    badge.textContent = data.status;
    tdStatus.appendChild(badge);

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(data.timestamp).toLocaleDateString();

    const tdAction = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.dataset.domain = domain;
    btn.addEventListener('click', async () => {
      delete user_classifications[btn.dataset.domain];
      await chrome.storage.sync.set({ user_classifications });
      location.reload();
    });
    tdAction.appendChild(btn);

    tr.append(tdDomain, tdStatus, tdDate, tdAction);
    tbody.appendChild(tr);
  });
});

document.getElementById('export')?.addEventListener('click', async () => {
  const { user_classifications = {} } = await chrome.storage.sync.get('user_classifications');
  const blob = new Blob([JSON.stringify(user_classifications, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'falah-classifications.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

document.getElementById('clearAll')?.addEventListener('click', async () => {
  if (confirm('Delete all your custom site classifications? This cannot be undone.')) {
    await chrome.storage.sync.remove('user_classifications');
    location.reload();
  }
});
