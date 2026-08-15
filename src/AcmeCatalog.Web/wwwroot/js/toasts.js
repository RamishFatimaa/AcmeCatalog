function showToast(message, type) {
    type = type || 'success';
    var host = document.getElementById('toast-host');
    if (!host) return;

    var toastEl = document.createElement('div');
    toastEl.className = 'toast align-items-center text-bg-' + type + ' border-0';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.setAttribute('data-testid', 'toast-notification');
    toastEl.innerHTML =
        '<div class="d-flex">' +
        '<div class="toast-body">' + message + '</div>' +
        '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
        '</div>';

    host.appendChild(toastEl);
    var toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toastEl.addEventListener('hidden.bs.toast', function () {
        toastEl.remove();
    });
    toast.show();
}

document.addEventListener('DOMContentLoaded', function () {
    var data = document.getElementById('server-toast-data');
    if (data) {
        showToast(data.getAttribute('data-toast-message'), data.getAttribute('data-toast-type'));
    }
});
