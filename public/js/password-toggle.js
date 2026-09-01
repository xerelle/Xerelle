// Adds a show/hide eye icon to every password field on the page,
// automatically — no per-page HTML changes needed, just include this
// script. Works regardless of each page's existing layout, since it
// wraps each password input in its own small positioning container
// rather than assuming anything about the surrounding markup.
(function () {
  function buildEyeIcon(isVisible) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.width = '18px';
    svg.style.height = '18px';

    if (isVisible) {
      // Open eye
      svg.innerHTML = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
    } else {
      // Eye with a slash through it
      svg.innerHTML = '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    }
    return svg;
  }

  function enhance(input) {
    // Don't double-wrap if this script somehow runs twice on the same input
    if (input.dataset.xerellePwToggle) return;
    input.dataset.xerellePwToggle = 'true';

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    // Preserve the input's own layout (width, margins) on the wrapper,
    // since the input itself will be switched to width:100% inside it.
    const computed = window.getComputedStyle(input);
    wrapper.style.width = input.style.width || '100%';
    wrapper.style.marginTop = computed.marginTop;
    wrapper.style.marginBottom = computed.marginBottom;

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.paddingRight = '44px';
    input.style.marginTop = '0';
    input.style.marginBottom = '0';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Show password');
    btn.style.position = 'absolute';
    btn.style.right = '12px';
    btn.style.top = '50%';
    btn.style.transform = 'translateY(-50%)';
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.padding = '4px';
    btn.style.cursor = 'pointer';
    btn.style.color = 'var(--text-secondary, #9C8791)';
    btn.style.display = 'flex';
    btn.appendChild(buildEyeIcon(false));

    let visible = false;
    btn.addEventListener('click', () => {
      visible = !visible;
      input.type = visible ? 'text' : 'password';
      btn.innerHTML = '';
      btn.appendChild(buildEyeIcon(visible));
      btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    });

    wrapper.appendChild(btn);
  }

  function init() {
    document.querySelectorAll('input[type="password"]').forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
