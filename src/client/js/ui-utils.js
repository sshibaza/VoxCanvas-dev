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
