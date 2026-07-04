// ============================================================
// TaskNova AI Assistant — home screen launcher
// Draggable floating bubble + teaser tooltip. Tapping the bubble
// (or the teaser) navigates to the standalone ai-assistant.html
// page. Include with a single script tag on the home page:
//   <script src="ai-launcher.js"></script>
// ============================================================
(function() {
  'use strict';

  function goToAIAssistant() {
    window.location.href = 'ai-assistant.html';
  }

  function injectKeyframeStyle() {
    if (document.getElementById('tn-ai-launcher-style')) return;
    var style = document.createElement('style');
    style.id = 'tn-ai-launcher-style';
    style.textContent = '@keyframes tnTeaserFadeIn { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform: translateY(0);} }';
    document.head.appendChild(style);
  }

  // ── Home screen teaser bubble — shows briefly, then fades away ──
  function initTeaserBubble() {
    var bubble = document.getElementById('aiTeaserBubble');
    if (!bubble) return;
    bubble.addEventListener('click', function() {
      bubble.style.display = 'none';
      goToAIAssistant();
    });

    if (sessionStorage.getItem('tn_ai_teaser_shown')) return;
    setTimeout(function() {
      bubble.style.display = 'block';
      bubble.style.animation = 'tnTeaserFadeIn 0.3s ease';
      sessionStorage.setItem('tn_ai_teaser_shown', '1');
      setTimeout(function() {
        bubble.style.transition = 'opacity 0.4s ease';
        bubble.style.opacity = '0';
        setTimeout(function() { bubble.style.display = 'none'; }, 400);
      }, 6000);
    }, 2500);
  }

  // ── Draggable floating bubble ──────────────────────────────────
  function initDraggableBubble() {
    const btn = document.getElementById('aiChatBtn');
    if (!btn) return;
    let isDragging = false;
    let moved = false;
    let startX, startY, startLeft, startTop;

    function clampPosition(left, top) {
      const margin = 6;
      const navHeight = 100; // reserve space so bubble never sits on top of bottom-nav
      const maxLeft = window.innerWidth - btn.offsetWidth - margin;
      const maxTop = window.innerHeight - btn.offsetHeight - navHeight;
      return {
        left: Math.min(Math.max(margin, left), maxLeft),
        top: Math.min(Math.max(margin, top), maxTop)
      };
    }

    function getPoint(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function onDragStart(e) {
      isDragging = true;
      moved = false;
      const p = getPoint(e);
      startX = p.x;
      startY = p.y;
      const rect = btn.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      btn.style.transition = 'none';
      btn.style.cursor = 'grabbing';
    }

    function onDragMove(e) {
      if (!isDragging) return;
      const p = getPoint(e);
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      const clamped = clampPosition(startLeft + dx, startTop + dy);
      btn.style.left = clamped.left + 'px';
      btn.style.top = clamped.top + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
      if (e.cancelable) e.preventDefault();
    }

    function onDragEnd(e) {
      if (!isDragging) return;
      isDragging = false;
      btn.style.cursor = 'grab';
      // Snap to nearest edge (left or right) for a natural floating feel
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const margin = 6;
      const snappedLeft = centerX < window.innerWidth / 2 ? margin : window.innerWidth - rect.width - margin;
      const clamped = clampPosition(snappedLeft, rect.top);
      btn.style.transition = 'left 0.25s ease, top 0.15s ease';
      btn.style.left = clamped.left + 'px';
      btn.style.top = clamped.top + 'px';

      // If this was a tap (not a drag), open the AI page directly here —
      // don't rely on the browser's synthetic click event, which can
      // sometimes fire on/leak to elements underneath on mobile.
      if (!moved) {
        goToAIAssistant();
      }
      if (e && e.cancelable) e.preventDefault();
    }

    btn.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    btn.addEventListener('touchstart', onDragStart, { passive: true });
    window.addEventListener('touchmove', onDragMove, { passive: false });
    btn.addEventListener('touchend', onDragEnd, { passive: false });

    // Suppress the browser's own synthetic click entirely — onDragEnd
    // already handles opening the AI page for both mouse and touch.
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }

  function init() {
    injectKeyframeStyle();
    initDraggableBubble();
    initTeaserBubble();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
