(function () {
  'use strict';

  var CART_KEY = 'bk_cart';

  // --- Storage ---

  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateUI();
    if (typeof window.bkRefreshCartState === 'function') window.bkRefreshCartState();
  }

  function addItem(item) {
    var cart = getCart();
    if (cart.find(function (i) { return i.id === item.id; })) return false;
    saveCart(cart.concat([item]));
    return true;
  }

  function removeItem(id) {
    saveCart(getCart().filter(function (i) { return i.id !== id; }));
  }

  function isInCart(id) {
    return getCart().some(function (i) { return i.id === id; });
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateUI();
  }

  // --- Helpers ---

  function fmt(cents) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 0
    }).format(cents / 100);
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Render ---

  function renderItems() {
    var el = document.getElementById('bk-cart-items');
    if (!el) return;
    var cart = getCart();
    if (!cart.length) {
      el.innerHTML = '<p class="bk-cart-empty">Your cart is empty.</p>';
      return;
    }
    el.innerHTML = cart.map(function (item) {
      return '<div class="bk-cart-item">' +
        '<div class="bk-cart-item-img">' +
          (item.image ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy">' : '') +
        '</div>' +
        '<div class="bk-cart-item-info">' +
          '<div class="bk-cart-item-name">' + esc(item.name) + '</div>' +
          '<div class="bk-cart-item-size">' + esc(item.size) + '</div>' +
          '<div class="bk-cart-item-price">' + fmt(item.price) + '</div>' +
        '</div>' +
        '<button class="bk-cart-remove" data-id="' + esc(item.id) + '">Remove</button>' +
      '</div>';
    }).join('');

    el.querySelectorAll('.bk-cart-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { removeItem(btn.dataset.id); });
    });
  }

  function renderTotals() {
    var el = document.getElementById('bk-cart-totals');
    if (!el) return;
    var cart = getCart();
    var subtotal = cart.reduce(function (s, i) { return s + i.price; }, 0);
    var shipping = cart.length ? 500 : 0;
    el.innerHTML =
      '<div class="bk-total-row"><span>Subtotal</span><span>' + fmt(subtotal) + '</span></div>' +
      '<div class="bk-total-row"><span>Shipping</span><span>' + (cart.length ? fmt(shipping) : '—') + '</span></div>' +
      '<div class="bk-total-row bk-grand"><span>Total</span><span>' + fmt(subtotal + shipping) + '</span></div>';
  }

  function updateUI() {
    var count = getCart().length;

    var badge = document.getElementById('bk-cart-badge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count ? 'flex' : 'none';
    }

    var floatBtn = document.getElementById('bk-cart-float');
    if (floatBtn) floatBtn.style.display = count ? 'flex' : 'none';

    var checkoutBtn = document.getElementById('bk-checkout-btn');
    if (checkoutBtn) checkoutBtn.disabled = !count;

    renderItems();
    renderTotals();
  }

  // --- Open / Close ---

  function openCart() {
    var overlay = document.getElementById('bk-cart-overlay');
    var drawer = document.getElementById('bk-cart-drawer');
    if (overlay) overlay.classList.add('open');
    if (drawer) drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    var overlay = document.getElementById('bk-cart-overlay');
    var drawer = document.getElementById('bk-cart-drawer');
    if (overlay) overlay.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
    document.body.style.overflow = '';
  }

  // --- Checkout ---

  async function checkout() {
    var cart = getCart();
    if (!cart.length) return;

    var btn = document.getElementById('bk-checkout-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

    try {
      var res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart })
      });
      var data = await res.json();
      if (data.clientSecret) {
        window.location.href = '/checkout/?cs=' + encodeURIComponent(data.clientSecret);
      } else {
        throw new Error(data.error || 'Checkout failed');
      }
    } catch (err) {
      alert('Checkout error: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Checkout →'; }
    }
  }

  // --- Inject ---

  function inject() {
    var styles = '<style id="bk-cart-styles">' +
      '.bk-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2000;opacity:0;pointer-events:none;transition:opacity .3s}' +
      '.bk-cart-overlay.open{opacity:1;pointer-events:all}' +
      '.bk-cart-drawer{position:fixed;top:0;right:0;width:360px;max-width:100vw;height:100%;background:var(--gray-900);border-left:1px solid var(--gray-800);z-index:2001;transform:translateX(100%);transition:transform .4s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}' +
      '.bk-cart-drawer.open{transform:translateX(0)}' +
      '.bk-cart-head{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.5rem;border-bottom:1px solid var(--gray-800)}' +
      '.bk-cart-title{font-family:var(--font-headline);font-size:.8rem;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--gray-200)}' +
      '.bk-cart-close-btn{background:none;border:none;color:var(--gray-500);cursor:pointer;padding:.25rem;line-height:0;transition:color .3s}' +
      '.bk-cart-close-btn:hover{color:var(--gray-200)}' +
      '#bk-cart-items{flex:1;overflow-y:auto;padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:.875rem}' +
      '.bk-cart-empty{text-align:center;color:var(--gray-600);font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;padding:2.5rem 0}' +
      '.bk-cart-item{display:flex;gap:.875rem;align-items:flex-start}' +
      '.bk-cart-item-img{width:68px;height:68px;background:var(--gray-800);border:1px solid var(--gray-700);flex-shrink:0;overflow:hidden}' +
      '.bk-cart-item-img img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.bk-cart-item-info{flex:1;min-width:0}' +
      '.bk-cart-item-name{font-family:var(--font-headline);font-size:.75rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--gray-300)}' +
      '.bk-cart-item-size{font-size:.65rem;color:var(--gray-500);letter-spacing:.1em;text-transform:uppercase;margin-top:.2rem}' +
      '.bk-cart-item-price{font-size:.75rem;color:var(--gray-400);margin-top:.35rem}' +
      '.bk-cart-remove{background:none;border:none;color:var(--gray-600);cursor:pointer;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;transition:color .3s;padding:.2rem 0;flex-shrink:0;align-self:center}' +
      '.bk-cart-remove:hover{color:var(--gray-400)}' +
      '.bk-cart-foot{border-top:1px solid var(--gray-800);padding:1.25rem 1.5rem}' +
      '#bk-cart-totals{display:flex;flex-direction:column;gap:.35rem;margin-bottom:1.25rem}' +
      '.bk-total-row{display:flex;justify-content:space-between;font-size:.72rem;color:var(--gray-500)}' +
      '.bk-grand{border-top:1px solid var(--gray-800);padding-top:.5rem;margin-top:.15rem;color:var(--gray-300);font-family:var(--font-headline);font-size:.8rem;font-weight:900;letter-spacing:.08em}' +
      '#bk-checkout-btn{width:100%;padding:.875rem;font-family:var(--font-headline);font-size:.75rem;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--black);background:var(--white);border:none;cursor:pointer;transition:background .3s}' +
      '#bk-checkout-btn:hover:not(:disabled){background:var(--gray-200)}' +
      '#bk-checkout-btn:disabled{opacity:.4;cursor:not-allowed}' +
      '#bk-cart-float{position:fixed;bottom:2rem;right:2rem;width:52px;height:52px;background:var(--white);color:var(--black);border:none;cursor:pointer;z-index:1500;display:flex;align-items:center;justify-content:center;transition:background .3s,transform .3s;box-shadow:0 4px 20px rgba(0,0,0,.4)}' +
      '#bk-cart-float:hover{background:var(--gray-200);transform:translateY(-2px)}' +
      '#bk-cart-badge{position:absolute;top:-6px;right:-6px;width:18px;height:18px;background:var(--gray-900);border:1px solid var(--gray-600);border-radius:50%;font-size:.6rem;display:flex;align-items:center;justify-content:center;color:var(--gray-200);font-weight:700;line-height:1}' +
      '</style>';

    var html =
      '<div id="bk-cart-overlay" class="bk-cart-overlay"></div>' +
      '<aside id="bk-cart-drawer" class="bk-cart-drawer" aria-label="Shopping cart" role="dialog">' +
        '<div class="bk-cart-head">' +
          '<span class="bk-cart-title">Cart</span>' +
          '<button id="bk-cart-close-btn" class="bk-cart-close-btn" aria-label="Close cart">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">' +
              '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        '<div id="bk-cart-items"></div>' +
        '<div class="bk-cart-foot">' +
          '<div id="bk-cart-totals"></div>' +
          '<button id="bk-checkout-btn" disabled>Checkout →</button>' +
        '</div>' +
      '</aside>' +
      '<button id="bk-cart-float" style="display:none;" aria-label="Open cart">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.5" fill="none">' +
          '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
          '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
        '</svg>' +
        '<span id="bk-cart-badge" style="display:none;">0</span>' +
      '</button>';

    document.head.insertAdjacentHTML('beforeend', styles);
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('bk-cart-overlay').addEventListener('click', closeCart);
    document.getElementById('bk-cart-close-btn').addEventListener('click', closeCart);
    document.getElementById('bk-cart-float').addEventListener('click', openCart);
    document.getElementById('bk-checkout-btn').addEventListener('click', checkout);

    updateUI();
  }

  inject();

  window.BKCart = { addItem: addItem, removeItem: removeItem, isInCart: isInCart, clearCart: clearCart, openCart: openCart, closeCart: closeCart };

})();
