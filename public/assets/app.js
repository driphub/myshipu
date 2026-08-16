import { api } from './api.js';
import { renderToday } from './pages/today.js';

const app = document.querySelector('#app');
const nav = document.querySelector('.main-nav');
const menu = document.querySelector('#mobile-menu');
const state = { members: [] };

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
}

async function route() {
  const name = (location.hash || '#today').slice(1);
  document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === name));
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  if (name === 'today') {
    await renderToday({ mount: app, api, members: state.members, showToast });
  } else {
    app.innerHTML = `<section class="empty-page"><p class="eyebrow">明膳家庭食养</p><h1>此模块正在载入</h1><p>返回“今日推荐”可先查看今天的全家方案。</p><a class="button primary" href="#today">返回今日推荐</a></section>`;
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

loadMembers().then(route).catch(showFatal);
