(function () {
    'use strict';

    var container = document.getElementById('items-container');
    if (!container) return;

    var searchInput = document.getElementById('search-input');
    var categorySelect = document.getElementById('category-select');
    var clearFiltersBtn = document.getElementById('clear-filters-btn');
    var filterStatus = document.getElementById('filter-status');
    var loadMoreBtn = document.getElementById('load-more-btn');
    var loadMoreSpinner = document.getElementById('load-more-spinner');
    var loadMoreWrapper = document.getElementById('load-more-wrapper');
    var quickViewModalEl = document.getElementById('quickViewModal');
    var deleteModalEl = document.getElementById('deleteConfirmModal');

    function getAntiForgeryToken() {
        var meta = document.querySelector('meta[name="request-verification-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    function debounce(fn, delay) {
        var timer;
        return function () {
            var args = arguments;
            var context = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(context, args); }, delay);
        };
    }

    // ---- Live search + category dropdown filtering (AJAX, no page reload) ----

    function applyFilters() {
        var term = searchInput.value.trim();
        var category = categorySelect.value;
        var hasFilter = term.length > 0 || category.length > 0;

        var url = new URL('/Items/Filter', window.location.origin);
        if (term) url.searchParams.set('term', term);
        if (category) url.searchParams.set('category', category);

        filterStatus.textContent = 'Searching...';

        fetch(url)
            .then(function (r) {
                var count = r.headers.get('X-Result-Count');
                return r.text().then(function (html) { return { html: html, count: count }; });
            })
            .then(function (result) {
                container.innerHTML = result.html;
                if (hasFilter) {
                    loadMoreWrapper.style.display = 'none';
                    filterStatus.textContent = result.count + ' item(s) found';
                } else {
                    loadMoreWrapper.style.display = 'none';
                    filterStatus.textContent = '';
                }
            })
            .catch(function () {
                filterStatus.textContent = 'Could not load results.';
            });
    }

    var debouncedApplyFilters = debounce(applyFilters, 300);

    searchInput.addEventListener('input', debouncedApplyFilters);
    categorySelect.addEventListener('change', applyFilters);

    clearFiltersBtn.addEventListener('click', function () {
        searchInput.value = '';
        categorySelect.value = '';
        window.location.href = window.location.pathname;
    });

    // ---- Load More (async pagination with spinner) ----

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function () {
            var skip = Number(loadMoreBtn.dataset.skip);
            loadMoreBtn.style.display = 'none';
            loadMoreSpinner.style.display = '';

            fetch('/Items/LoadMore?skip=' + skip)
                .then(function (r) {
                    var hasMore = r.headers.get('X-Has-More') === 'true';
                    return r.text().then(function (html) { return { html: html, hasMore: hasMore }; });
                })
                .then(function (result) {
                    var temp = document.createElement('div');
                    temp.innerHTML = result.html;
                    var newCards = Array.prototype.slice.call(temp.children);
                    newCards.forEach(function (card) { container.appendChild(card); });

                    loadMoreBtn.dataset.skip = skip + newCards.length;
                    loadMoreSpinner.style.display = 'none';

                    if (result.hasMore) {
                        loadMoreBtn.style.display = '';
                    } else {
                        loadMoreWrapper.style.display = 'none';
                    }
                })
                .catch(function () {
                    loadMoreSpinner.style.display = 'none';
                    loadMoreBtn.style.display = '';
                });
        });
    }

    // ---- Quick View modal (AJAX-loaded content) ----

    container.addEventListener('click', function (e) {
        var btn = e.target.closest('.quick-view-btn');
        if (!btn) return;

        var itemId = btn.getAttribute('data-item-id');
        var modalBody = document.getElementById('quickViewModalBody');
        modalBody.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';

        var modal = bootstrap.Modal.getOrCreateInstance(quickViewModalEl);
        modal.show();

        fetch('/Items/QuickView/' + itemId)
            .then(function (r) { return r.text(); })
            .then(function (html) { modalBody.innerHTML = html; })
            .catch(function () {
                modalBody.innerHTML = '<div class="alert alert-danger">Could not load item.</div>';
            });
    });

    // ---- Delete confirmation modal (populate from the triggering button) ----

    if (deleteModalEl) {
        deleteModalEl.addEventListener('show.bs.modal', function (event) {
            var button = event.relatedTarget;
            document.getElementById('delete-item-id').value = button.getAttribute('data-item-id');
            document.getElementById('delete-item-name').textContent = button.getAttribute('data-item-name');
        });
    }

    // ---- Drag-and-drop reorder (event delegation so dynamically loaded cards work too) ----

    var draggingEl = null;

    container.addEventListener('dragstart', function (e) {
        var card = e.target.closest('.item-card-col');
        if (!card) return;
        draggingEl = card;
        card.classList.add('dragging');
    });

    container.addEventListener('dragend', function (e) {
        var card = e.target.closest('.item-card-col');
        if (!card) return;
        card.classList.remove('dragging');
        draggingEl = null;
        persistOrder();
    });

    container.addEventListener('dragover', function (e) {
        if (!draggingEl) return;
        e.preventDefault();
        var afterElement = getDragAfterElement(e.clientX, e.clientY);
        if (afterElement == null) {
            container.appendChild(draggingEl);
        } else if (afterElement !== draggingEl) {
            container.insertBefore(draggingEl, afterElement);
        }
    });

    function getDragAfterElement(x, y) {
        var elements = Array.prototype.slice.call(container.querySelectorAll('.item-card-col:not(.dragging)'));
        var closest = { distance: Number.POSITIVE_INFINITY, element: null };

        elements.forEach(function (el) {
            var box = el.getBoundingClientRect();
            var centerX = box.left + box.width / 2;
            var centerY = box.top + box.height / 2;
            var distance = Math.hypot(x - centerX, y - centerY);
            if (distance < closest.distance) {
                closest = { distance: distance, element: el };
            }
        });

        return closest.element;
    }

    function persistOrder() {
        var ids = Array.prototype.slice.call(container.querySelectorAll('.item-card-col'))
            .map(function (el) { return Number(el.dataset.itemId); });

        fetch('/Items/Reorder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': getAntiForgeryToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(ids)
        })
            .then(function (r) {
                if (r.ok) {
                    showToast('Catalog order updated.', 'success');
                } else if (r.status === 401) {
                    showToast('Please log in to save catalog reordering.', 'danger');
                } else {
                    showToast('Could not save the new order.', 'danger');
                }
            })
            .catch(function () {
                showToast('Could not save the new order.', 'danger');
            });
    }
})();
