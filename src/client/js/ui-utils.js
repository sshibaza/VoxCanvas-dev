export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  const bgColors = {
    info: 'bg-sf-blue',
    success: 'bg-sf-success',
    error: 'bg-sf-error',
    warning: 'bg-sf-orange',
  };

  toast.className = `${bgColors[type] || bgColors.info} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium toast-enter max-w-sm`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function addLogEntry(message, type = 'info') {
  const container = document.getElementById('log-entries');
  if (!container) return;

  const colors = {
    info: 'text-white/60',
    success: 'text-sf-success',
    error: 'text-sf-error',
    warning: 'text-sf-orange',
  };

  const entry = document.createElement('div');
  entry.className = `${colors[type] || colors.info} border-b border-white/5 pb-1`;
  const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  entry.innerHTML = `<span class="opacity-40">[${time}]</span> ${escapeHtml(message)}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
