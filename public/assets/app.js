import { api } from './api.js';
import { renderToday } from './pages/today.js';
import { renderFamily } from './pages/family.js';
import { renderLibrary } from './pages/library.js';
import { renderTongue } from './pages/tongue.js';

const app = document.querySelector('#app');
const nav = document.querySelector('.main-nav');
const menu = document.querySelector('#mobile-menu');
const state = { members: [], taxonomy: {}, labels: {} };

document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
}).format(new Date());

function showToast(message, type = 'info') {
  const region = document.querySelector('#toast-region');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

async function loadMembers() {
  const result = await api('/api/family');
  state.members = result.members;
  window.__mingyuanMembers = state.members;
}

async function loadTaxonomy() {
  const result = await api('/api/taxonomy');
  state.taxonomy = result.taxonomy;
  state.labels = result.labels;
}

async function route() {
  const name = (location.hash || '#today').slice(1);
  document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === name));
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  if (name === 'today') {
    await renderToday({ mount: app, api, members: state.members, showToast });
  } else if (name === 'family') {
    await renderFamily({ mount: app, api, members: state.members, taxonomy: state.taxonomy, labels: state.labels, refreshMembers: loadMembers, showToast });
  } else if (name === 'library') {
    await renderLibrary({ mount: app, api, taxonomy: state.taxonomy, labels: state.labels, showToast });
  } else if (name === 'tongue') {
    await renderTongue({ mount: app, api, members: state.members, taxonomy: state.taxonomy, labels: state.labels, showToast });
  } else {
    location.hash = '#today';
  }
  app.focus();
}

menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});
window.addEventListener('hashchange', () => route().catch(showFatal));

function showFatal(error) {
  app.innerHTML = `<section class="error-state"><h1>暂时无法载入</h1><p>${error.message}</p><button class="button primary" id="retry-app">重试</button></section>`;
  document.querySelector('#retry-app')?.addEventListener('click', () => location.reload());
}

Promise.all([loadMembers(), loadTaxonomy()]).then(async () => {
  const { warnings = [] } = await api('/api/health');
  warnings.forEach((warning) => showToast(warning.message, 'info'));
  await route();
}).catch(showFatal);
