(function () {
  'use strict';

  // Retry utility with exponential backoff for analytics tracking
  async function fetchWithRetry(url, options, maxRetries = 3) {
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Only retry on network errors or 5xx errors
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }

        // Server error - retry
        lastError = new Error(`Server error: ${response.status}`);
      } catch (error) {
        // Network error - retry
        lastError = error;
      }

      // Wait before retry with exponential backoff: 500ms, 1s, 2s
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  class Quizza {
    constructor(container) {
      this.container = container;
      this.quizId = container.dataset.quizId;
      this.appUrl = container.dataset.appUrl;
      this.quiz = null;
      this.sessionId = null;
      this.currentQuestionIndex = 0;
      this.answers = [];
      this.selectedAnswerId = null;

      // DOM elements
      this.loadingEl = container.querySelector('.quizza-loading');
      this.errorEl = container.querySelector('.quizza-error');
      this.errorMessageEl = container.querySelector('.quizza-error-message');
      this.containerEl = container.querySelector('.quizza-container');
      this.titleEl = container.querySelector('.quizza-title');
      this.descriptionEl = container.querySelector('.quizza-description');
      this.progressFillEl = container.querySelector('.quizza-progress-fill');
      this.progressCurrentEl = container.querySelector('.quizza-progress-text .current');
      this.progressTotalEl = container.querySelector('.quizza-progress-text .total');
      this.questionTextEl = container.querySelector('.quizza-question-text');
      this.answersEl = container.querySelector('.quizza-answers');
      this.questionEl = container.querySelector('.quizza-question');
      this.resultEl = container.querySelector('.quizza-result');
      this.resultContentEl = container.querySelector('.quizza-result-content');
      this.backBtn = container.querySelector('.quizza-back-btn');
      this.nextBtn = container.querySelector('.quizza-next-btn');
      this.retryBtn = container.querySelector('.quizza-retry-btn');
      this.restartBtn = container.querySelector('.quizza-restart-btn');

      this.init();
    }

    // Cookie helper functions
    getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    }

    setCookie(name, value, days = 30) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      const expires = `expires=${date.toUTCString()}`;
      document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`;
    }

    deleteCookie(name) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }

    // Inject custom CSS into the page
    injectCustomCss(css) {
      if (!css || css.trim() === '') return;

      // Check if style element already exists
      const existingStyle = document.getElementById(`quizza-custom-css-${this.quizId}`);
      if (existingStyle) {
        existingStyle.textContent = css;
        return;
      }

      // Create new style element
      const styleElement = document.createElement('style');
      styleElement.id = `quizza-custom-css-${this.quizId}`;
      styleElement.textContent = css;
      document.head.appendChild(styleElement);
    }

    // Apply theme settings (colors, button styles, font sizes)
    applyThemeSettings(settings) {
      if (!settings) return;

      // Set CSS variables for colors
      if (settings.primaryColor) {
        this.container.style.setProperty('--quizza-primary-color', settings.primaryColor);
      }
      if (settings.secondaryColor) {
        this.container.style.setProperty('--quizza-secondary-color', settings.secondaryColor);
      }

      // Apply button style class
      const buttonStyle = settings.buttonStyle || 'rounded';
      this.container.classList.remove('quizza-btn-rounded', 'quizza-btn-square', 'quizza-btn-pill');
      this.container.classList.add(`quizza-btn-${buttonStyle}`);

      // Apply font size class
      const fontSize = settings.fontSize || 'medium';
      this.container.classList.remove('quizza-font-small', 'quizza-font-medium', 'quizza-font-large');
      this.container.classList.add(`quizza-font-${fontSize}`);
    }

    async init() {
      if (!this.quizId || !this.appUrl) {
        console.error('[Quizza] Missing quizId or appUrl');
        this.showError('Quiz ID or App URL not configured');
        return;
      }

      // Check if quiz was already completed
      const completedKey = `quizza_completed_${this.quizId}`;
      const wasCompleted = localStorage.getItem(completedKey);

      if (wasCompleted) {
        // Fetch quiz data first to apply custom CSS and theme settings
        try {
          const cacheBuster = Date.now();
          const url = `${this.appUrl}/api/quiz/${this.quizId}?cb=${cacheBuster}`;
          const response = await fetch(url);
          const data = await response.json();
          if (data.success && data.quiz) {
            this.quiz = data.quiz;
            if (this.quiz.custom_css) {
              this.injectCustomCss(this.quiz.custom_css);
            }
            if (this.quiz.theme_settings) {
              this.applyThemeSettings(this.quiz.theme_settings);
            }
          }
        } catch (e) {
          // Non-critical: styles won't apply but result still shows
          console.warn('[Quizza] Could not load quiz styles:', e);
        }

        // Show the stored result from previous completion
        this.questionEl.style.display = 'none';
        this.resultEl.style.display = 'block';

        // Check if quiz NOW has a pool (pool may have been added after initial completion)
        const hasPool = this.quiz && this.quiz.pool_type && (
          (this.quiz.pool_type === 'products' && this.quiz.product_pool?.length > 0) ||
          (this.quiz.pool_type === 'collections' && this.quiz.collection_pool?.length > 0)
        );

        if (hasPool) {
          // Re-render pool result — show top products from pool (no answers context on restore)
          this.resultContentEl.innerHTML = '<p class="quizza-ai-loading" style="color:#6b7280;font-size:14px;">Loading your recommendations...</p>';
          this.showResetButton();
          const pool = this.quiz.pool_type === 'products'
            ? this.quiz.product_pool
            : this.quiz.collection_pool;
          try {
            const items = await this.fetchPoolMatch([], pool, this.quiz.pool_type);
            this.resultContentEl.innerHTML = '';
            this.renderPoolResult(items, this.quiz.pool_type, []);
          } catch (e) {
            // Fallback: show first 4 pool items directly
            this.resultContentEl.innerHTML = '';
            this.renderPoolResult(pool.slice(0, 4), this.quiz.pool_type, []);
          }
        } else {
          try {
            const resultData = JSON.parse(wasCompleted);
            this.resultContentEl.innerHTML = this.renderActionResult(resultData.actionType, resultData.actionData);
          } catch (e) {
            this.resultContentEl.innerHTML = '<p style="color: #666; font-style: italic;">Quiz already completed.</p>';
          }
        }
        this.showResetButton();
        return;
      }

      // Event listeners
      this.nextBtn.addEventListener('click', () => this.handleNext());
      this.backBtn.addEventListener('click', () => this.handleBack());
      this.retryBtn.addEventListener('click', () => this.init());
      this.restartBtn.addEventListener('click', () => this.restart());

      await this.loadQuiz();
    }

    async loadQuiz() {
      // Don't show loading state - keep it seamless
      try {
        // Add cache busting parameter to prevent browser caching old quiz data
        const cacheBuster = Date.now();
        const url = `${this.appUrl}/api/quiz/${this.quizId}?cb=${cacheBuster}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success || !data.quiz) {
          throw new Error(data.error || 'Failed to load quiz');
        }

        this.quiz = data.quiz;

        // Inject custom CSS if provided
        if (this.quiz.custom_css) {
          this.injectCustomCss(this.quiz.custom_css);
        }

        // Apply theme settings if provided
        if (this.quiz.theme_settings) {
          this.applyThemeSettings(this.quiz.theme_settings);
        }

        // Track impression every time quiz is viewed
        this.trackImpression().catch(err => console.error('Impression tracking error:', err));

        // Start session in background without blocking render
        this.startSession().catch(err => console.error('Session start error:', err));
        this.renderQuiz();
      } catch (error) {
        console.error('[Quizza] Error loading quiz:', error);
        this.showError(error.message || 'Failed to load quiz. Please try again.');
      }
    }

    async startSession() {
      // Check if session already exists in cookie
      const existingSessionId = this.getCookie('quizza_session');

      if (existingSessionId) {
        this.sessionId = existingSessionId;
        return;
      }

      // Only create a new session if one doesn't exist (with retry)
      try {
        // Get customer ID from Shopify if available
        const customerId = window.Shopify?.customerId || window.meta?.page?.customerId;

        const response = await fetchWithRetry(`${this.appUrl}/api/quiz-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            quiz_id: this.quizId,
            customer_id: customerId ? String(customerId) : null,
            page_url: window.location.href,
            user_agent: navigator.userAgent,
          }),
        });

        const data = await response.json();

        if (data.success && data.session_id) {
          this.sessionId = data.session_id;
          // Store session ID in cookie for order attribution (90 days for longer attribution window)
          this.setCookie('quizza_session', this.sessionId, 90);
        } else {
          console.error('[Quizza] Failed to start session:', data.error);
        }
      } catch (error) {
        console.error('[Quizza] Session start failed after retries:', error);
      }
    }

    async trackImpression() {
      // Track impression every time the quiz is viewed (with retry)
      try {
        await fetchWithRetry(`${this.appUrl}/api/quiz-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'impression',
            quiz_id: this.quizId,
          }),
        });
      } catch (error) {
        // After all retries failed - log but don't disrupt user experience
        console.error('[Quizza] Impression tracking failed after retries:', error);
      }
    }

    renderQuiz() {
      this.hideError();
      // Container is already visible - no need to show/hide

      // Show first question immediately
      this.renderQuestion();
    }

    renderQuestion() {
      const question = this.quiz.questions[this.currentQuestionIndex];

      // Update question (progress bar removed)
      this.questionTextEl.textContent = question.question_text;

      // Clear and render answers
      this.answersEl.innerHTML = '';
      question.answers.forEach((answer) => {
        const button = document.createElement('button');
        button.className = 'quizza-answer-btn';
        button.textContent = answer.answer_text;
        button.dataset.answerId = answer.answer_id;
        button.dataset.actionType = answer.action_type;
        button.dataset.actionData = JSON.stringify(answer.action_data);

        button.addEventListener('click', () => this.selectAnswer(answer, button));

        this.answersEl.appendChild(button);
      });

      // Hide navigation buttons (removed - auto-advance on answer selection)
      this.backBtn.style.display = 'none';
      this.nextBtn.style.display = 'none';
      this.selectedAnswerId = null;

      // Show question, hide result
      this.questionEl.style.display = 'block';
      this.resultEl.style.display = 'none';
    }

    selectAnswer(answer, button) {
      // Remove previous selection
      this.answersEl.querySelectorAll('.quizza-answer-btn').forEach((btn) => {
        btn.classList.remove('selected');
      });

      // Mark as selected
      button.classList.add('selected');
      this.selectedAnswerId = answer.answer_id;

      // Store answer for this question
      this.answers[this.currentQuestionIndex] = answer;

      // Record answer in backend
      this.recordAnswer(answer);

      // Auto-advance to next question after a short delay
      setTimeout(() => this.handleNext(), 300);
    }

    async recordAnswer(answer) {
      if (!this.sessionId) return;

      const question = this.quiz.questions[this.currentQuestionIndex];

      try {
        await fetchWithRetry(`${this.appUrl}/api/quiz-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'answer',
            session_id: this.sessionId,
            quiz_id: this.quizId,
            question_id: question.question_id,
            answer_id: answer.answer_id,
          }),
        });
      } catch (error) {
        console.error('[Quizza] Answer recording failed after retries:', error);
      }
    }

    async handleNext() {
      if (!this.selectedAnswerId) return;

      // Check if this is the last question
      if (this.currentQuestionIndex === this.quiz.questions.length - 1) {
        await this.showResult();
      } else {
        this.currentQuestionIndex++;
        this.renderQuestion();
      }
    }

    handleBack() {
      if (this.currentQuestionIndex > 0) {
        this.currentQuestionIndex--;
        this.renderQuestion();

        // Restore previous selection if exists
        if (this.answers[this.currentQuestionIndex]) {
          const answerId = this.answers[this.currentQuestionIndex].answer_id;
          const button = this.answersEl.querySelector(`[data-answer-id="${answerId}"]`);
          if (button) {
            button.classList.add('selected');
            this.selectedAnswerId = answerId;
            this.nextBtn.disabled = false;
          }
        }
      }
    }

    async showResult() {
      const finalAnswer = this.answers[this.currentQuestionIndex];
      const actionData = finalAnswer.action_data;
      const hasPool = this.quiz.pool_type && (
        (this.quiz.pool_type === 'products' && this.quiz.product_pool?.length > 0) ||
        (this.quiz.pool_type === 'collections' && this.quiz.collection_pool?.length > 0)
      );

      // Mark quiz as completed and store result in localStorage
      const completedKey = `quizza_completed_${this.quizId}`;
      localStorage.setItem(completedKey, JSON.stringify({
        actionType: hasPool ? 'pool_mode' : finalAnswer.action_type,
        actionData: hasPool ? null : actionData,
      }));

      // Mark session as completed (with retry)
      if (this.sessionId) {
        try {
          await fetchWithRetry(`${this.appUrl}/api/quiz-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'complete', session_id: this.sessionId }),
          });
          await this.addSessionToCart(this.sessionId);
        } catch (error) {
          console.error('[Quizza] Session completion failed after retries:', error);
        }
      }

      // Pool mode: AI picks from merchant-curated pool based on all answers
      if (hasPool) {
        this.resultContentEl.innerHTML = '<p class="quizza-ai-loading" style="color:#6b7280;font-size:14px;">Finding your best matches...</p>';
        this.questionEl.style.display = 'none';
        this.resultEl.style.display = 'block';
        this.backBtn.style.display = 'none';
        this.nextBtn.style.display = 'none';
        if (this.restartBtn) this.restartBtn.style.display = 'none';
        this.showResetButton();

        // Run pool match + result copy in parallel
        const answersContext = this.quiz.questions.map((q, i) => {
          const ans = this.answers[i];
          return ans ? { question: q.question_text, answer: ans.answer_text } : null;
        }).filter(Boolean);

        const pool = this.quiz.pool_type === 'products'
          ? this.quiz.product_pool
          : this.quiz.collection_pool;

        const [matchedItems] = await Promise.all([
          this.fetchPoolMatch(answersContext, pool, this.quiz.pool_type),
        ]);

        this.resultContentEl.innerHTML = '';
        this.renderPoolResult(matchedItems, this.quiz.pool_type, answersContext);
        return;
      }

      // Legacy per-answer mode
      this.resultContentEl.innerHTML = this.renderActionResult(finalAnswer.action_type, actionData);
      this.questionEl.style.display = 'none';
      this.resultEl.style.display = 'block';
      this.backBtn.style.display = 'none';
      this.nextBtn.style.display = 'none';
      if (this.restartBtn) this.restartBtn.style.display = 'none';
      this.showResetButton();
      this.addAiEnhancements(finalAnswer.action_type, actionData);
    }

    async fetchPoolMatch(answersContext, pool, poolType) {
      try {
        const response = await fetch(`${this.appUrl}/api/ai/product-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: answersContext, pool, poolType, maxResults: 4 }),
        });
        if (!response.ok) throw new Error('Match failed');
        const data = await response.json();
        return data.items || pool.slice(0, 4);
      } catch (err) {
        console.error('[Quizza AI] Pool match error:', err);
        return pool.slice(0, 4);
      }
    }

    renderPoolResult(items, poolType, answersContext) {
      if (!items || items.length === 0) {
        this.resultContentEl.innerHTML = '<p>No recommendations found.</p>';
        return;
      }

      // AI personalized copy placeholder (streams in)
      const aiCopyEl = document.createElement('div');
      aiCopyEl.className = 'quizza-ai-copy';
      aiCopyEl.style.cssText = 'font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; min-height: 24px;';
      this.resultContentEl.appendChild(aiCopyEl);

      // Products/collections grid
      const gridEl = document.createElement('div');
      gridEl.className = 'quizza-products-result';

      const labelEl = document.createElement('div');
      labelEl.className = 'quizza-custom-text';
      labelEl.textContent = poolType === 'collections'
        ? 'Based on your answers, check out these collections:'
        : 'Based on your answers, we recommend these products:';
      gridEl.appendChild(labelEl);

      const grid = document.createElement('div');
      grid.className = 'quizza-products-grid quizza-grid-cols-2';

      items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'quizza-product-card';
        const imageUrl = item.image || '';
        const handle = item.handle || '';
        const price = item.price || '';
        const href = poolType === 'collections' ? `/collections/${handle}` : `/products/${handle}`;

        card.innerHTML = `
          ${imageUrl ? `<img src="${imageUrl}" alt="${item.title}" class="quizza-product-image" />` : ''}
          <div class="quizza-product-info">
            <h3 class="quizza-product-title">${item.title}</h3>
            ${price && poolType !== 'collections' ? `<p class="quizza-product-price">$${price}</p>` : ''}
            ${handle ? `<a href="${href}" class="quizza-shop-now-btn">Shop Now</a>` : ''}
          </div>
        `;
        grid.appendChild(card);
      });

      gridEl.appendChild(grid);
      this.resultContentEl.appendChild(gridEl);

      // Stream personalized copy
      this.streamResultCopy(aiCopyEl, answersContext, items, poolType);
    }

    async streamResultCopy(targetEl, answersContext, items, poolType) {
      const products = poolType !== 'collections'
        ? items.map((p) => ({ title: p.title, price: p.price || '' }))
        : [];

      try {
        const response = await fetch(`${this.appUrl}/api/ai/result-copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: answersContext,
            products,
            quizTitle: this.quiz.title || '',
          }),
        });

        if (!response.ok || !response.body) { targetEl.remove(); return; }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]' || data === '[ERROR]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) { aiText += parsed.text; targetEl.textContent = aiText; }
            } catch (_) {}
          }
        }

        if (!aiText) targetEl.remove();
      } catch (err) {
        console.error('[Quizza AI] Result copy error:', err);
        targetEl.remove();
      }
    }

    async addAiEnhancements(actionType, actionData) {
      // Build answers context from all questions answered
      const answersContext = this.quiz.questions.map((q, i) => {
        const ans = this.answers[i];
        if (!ans) return null;
        return { question: q.question_text, answer: ans.answer_text };
      }).filter(Boolean);

      if (answersContext.length === 0) return;

      // Build products list for personalization context
      let products = [];
      if (actionType === 'show_products' && actionData.products) {
        products = actionData.products.map((p) => ({
          title: p.title,
          price: p.variants?.edges?.[0]?.node?.price || p.variants?.[0]?.price || '',
        }));
      }

      // 1. AI personalized result copy (streaming) - prepended above static result
      const aiCopyEl = document.createElement('div');
      aiCopyEl.className = 'quizza-ai-copy';
      aiCopyEl.style.cssText = 'font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; min-height: 24px;';
      this.resultContentEl.prepend(aiCopyEl);

      try {
        const response = await fetch(`${this.appUrl}/api/ai/result-copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: answersContext,
            products,
            quizTitle: this.quiz.quiz_title || this.quiz.title || '',
            shop: this.quiz.shop,
          }),
        });

        if (response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let aiText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]' || data === '[ERROR]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  aiText += parsed.text;
                  aiCopyEl.textContent = aiText;
                }
              } catch (_) {}
            }
          }

          if (!aiText) aiCopyEl.remove();
        } else {
          aiCopyEl.remove();
        }
      } catch (err) {
        console.error('[Quizza AI] Result copy error:', err);
        aiCopyEl.remove();
      }

      // 2. AI semantic product match - only for show_products results
      if (actionType === 'show_products') {
        this.addAiProductMatch(answersContext);
      }
    }

    async addAiProductMatch(answersContext) {
      try {
        const response = await fetch(`${this.appUrl}/api/ai/product-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: answersContext,
            quizId: this.quizId,
            shop: this.quiz.shop,
            maxProducts: 4,
          }),
        });

        if (!response.ok) return;
        const data = await response.json();

        if (!data.products || data.products.length === 0) return;

        // Render AI-selected products as "AI Picks for You" section
        const aiProductsEl = document.createElement('div');
        aiProductsEl.className = 'quizza-ai-products';
        aiProductsEl.style.cssText = 'margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;';

        const heading = document.createElement('p');
        heading.className = 'quizza-custom-text';
        heading.textContent = 'AI picks just for you:';
        aiProductsEl.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'quizza-products-grid quizza-grid-cols-2';

        data.products.forEach((product) => {
          const card = document.createElement('div');
          card.className = 'quizza-product-card';
          const imageUrl = product.image || '';
          const price = product.price || '';
          const handle = product.handle || '';

          card.innerHTML = `
            ${imageUrl ? `<img src="${imageUrl}" alt="${product.title}" class="quizza-product-image" />` : ''}
            <div class="quizza-product-info">
              <h3 class="quizza-product-title">${product.title}</h3>
              ${price ? `<p class="quizza-product-price">$${price}</p>` : ''}
              ${handle ? `<a href="/products/${handle}" class="quizza-shop-now-btn">Shop Now</a>` : ''}
            </div>
          `;
          grid.appendChild(card);
        });

        aiProductsEl.appendChild(grid);
        this.resultContentEl.appendChild(aiProductsEl);
      } catch (err) {
        console.error('[Quizza AI] Product match error:', err);
      }
    }

    showResetButton() {
      // Only show reset button in staging/development environments
      const isProduction = this.appUrl && this.appUrl.includes('turbo-quizz-1660bbe41f52.herokuapp.com');
      if (isProduction) {
        return; // Don't show reset button in production
      }

      // Check if reset button already exists
      let resetBtn = this.container.querySelector('.quizza-reset-btn');
      if (!resetBtn) {
        resetBtn = document.createElement('button');
        resetBtn.className = 'quizza-reset-btn';
        resetBtn.textContent = 'Reset Quiz (testing purposes only)';
        resetBtn.style.cssText = 'margin-top: 16px; padding: 8px 16px; background: #dc2626; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; color: #fff; font-weight: 600; margin-left: auto; margin-right: auto;';
        resetBtn.addEventListener('click', () => this.resetForTesting());
        this.resultEl.appendChild(resetBtn);
      }
      resetBtn.style.display = 'block';
    }

    resetForTesting() {
      // Clear localStorage completion flag
      const completedKey = `quizza_completed_${this.quizId}`;
      localStorage.removeItem(completedKey);

      // Clear session cookie
      this.deleteCookie('quizza_session');

      // Reset state
      this.currentQuestionIndex = 0;
      this.answers = [];
      this.selectedAnswerId = null;
      this.sessionId = null;

      // Re-show the container and re-initialize
      this.container.style.display = '';
      this.loadQuiz();
    }

    renderActionResult(actionType, actionData) {
      switch (actionType) {
        case 'show_text':
          return this.renderTextResult(actionData);
        case 'show_html':
          return this.renderHtmlResult(actionData);
        case 'show_products':
          return this.renderProductsResult(actionData);
        case 'show_collections':
          return this.renderCollectionsResult(actionData);
        default:
          return '<p>Thank you for completing the quiz!</p>';
      }
    }

    renderTextResult(actionData) {
      const style = actionData.styling || {};
      const backgroundColor = style.backgroundColor || 'transparent';
      const textColor = style.textColor || 'inherit';

      return `
        <div class="quizza-text-result" style="background-color: ${backgroundColor}; color: ${textColor};">
          ${actionData.html || `<p>${actionData.text}</p>`}
        </div>
      `;
    }

    renderHtmlResult(actionData) {
      // Render raw HTML content
      return `
        <div class="quizza-html-result">
          ${actionData.html || ''}
        </div>
      `;
    }

    renderProductsResult(actionData) {
      const products = actionData.products || [];
      const customText = actionData.custom_text || 'Based on your answers, we recommend these products:';
      const gridColumns = actionData.grid_columns || 2;

      if (products.length === 0) {
        return '<p>No products available.</p>';
      }

      return `
        <div class="quizza-products-result">
          <div class="quizza-custom-text">${customText}</div>
          <div class="quizza-products-grid quizza-grid-cols-${gridColumns}">
            ${products
              .map((product) => {
                // Handle GraphQL edge/node format (stored from admin) and direct array format
                const imageUrl = product.images?.edges?.[0]?.node?.originalSrc ||
                                 product.images?.edges?.[0]?.node?.url ||
                                 product.images?.[0]?.originalSrc ||
                                 product.images?.[0]?.url ||
                                 product.image?.originalSrc ||
                                 product.image?.url || '';
                const price = product.variants?.edges?.[0]?.node?.price ||
                              product.variants?.[0]?.price || '';
                // Use handle property directly - it's fetched from GraphQL and stored with product
                const handle = product.handle || '';

                return `
                  <div class="quizza-product-card">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${product.title}" class="quizza-product-image" />` : ''}
                    <div class="quizza-product-info">
                      <h3 class="quizza-product-title">${product.title}</h3>
                      ${price ? `<p class="quizza-product-price">$${price}</p>` : ''}
                      ${handle ? `<a href="/products/${handle}" class="quizza-shop-now-btn">Shop Now</a>` : ''}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    renderCollectionsResult(actionData) {
      const collections = actionData.collections || [];
      const customText = actionData.custom_text || 'Based on your answers, check out these collections:';
      const gridColumns = actionData.grid_columns || 2;

      if (collections.length === 0) {
        return '<p>No collections available.</p>';
      }

      return `
        <div class="quizza-collections-result">
          <div class="quizza-custom-text">${customText}</div>
          <div class="quizza-products-grid quizza-grid-cols-${gridColumns}">
            ${collections
              .map((collection) => {
                // Handle both direct image object and nested format
                const imageUrl = collection.image?.originalSrc ||
                                 collection.image?.url || '';
                // Use handle property directly - it's fetched from GraphQL and stored with collection
                const handle = collection.handle || '';

                return `
                  <div class="quizza-product-card">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${collection.title}" class="quizza-product-image" />` : ''}
                    <div class="quizza-product-info">
                      <h3 class="quizza-product-title">${collection.title}</h3>
                      ${handle ? `<a href="/collections/${handle}" class="quizza-shop-now-btn">Shop Now</a>` : ''}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    extractHandle(gid) {
      // Extract handle/ID from Shopify GID
      // Example: "gid://shopify/Product/123" -> "123"
      // Or could be product handle depending on data structure
      if (!gid) return '';
      const parts = gid.split('/');
      return parts[parts.length - 1];
    }

    async addSessionToCart(sessionId) {
      try {
        // Build attributes object with session info and quiz answers
        const attributes = {
          'quizza_session': sessionId,
          'quiz_id': this.quizId,
        };

        // Add quiz answers as attributes (using metafield_key if set)
        this.quiz.questions.forEach((question, index) => {
          const answer = this.answers[index];
          if (answer && question.metafield_key) {
            // Use the metafield_key as the attribute key with quiz_ prefix
            const key = `quiz_${question.metafield_key}`;
            attributes[key] = answer.answer_text;
          }
        });

        // Add quiz session ID as cart attribute for order attribution
        const response = await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attributes }),
        });

        if (!response.ok) {
          console.error('[Quizza] Failed to add session to cart:', await response.text());
        }
      } catch (error) {
        console.error('[Quizza] Error adding session to cart:', error);
      }
    }

    restart() {
      this.currentQuestionIndex = 0;
      this.answers = [];
      this.selectedAnswerId = null;
      // Clear session to create a new one on restart
      this.sessionId = null;
      this.deleteCookie('quizza_session');
      this.renderQuiz();
      this.startSession();
      this.nextBtn.style.display = 'inline-block';
    }

    showLoading() {
      // No-op - we don't show loading state for seamless experience
    }

    hideLoading() {
      // No-op - we don't show loading state for seamless experience
    }

    showError(message) {
      this.errorMessageEl.textContent = message;
      this.errorEl.style.display = 'block';
      this.containerEl.style.opacity = '0.3';
    }

    hideError() {
      this.errorEl.style.display = 'none';
    }
  }

  // Initialize all quiz widgets on page load
  function initQuizzes() {
    const quizContainers = document.querySelectorAll('.quizza-widget');
    quizContainers.forEach((container) => {
      new Quizza(container);
    });
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizzes);
  } else {
    initQuizzes();
  }
})();
