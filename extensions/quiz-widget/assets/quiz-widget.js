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

  class TurboQuiz {
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
      this.loadingEl = container.querySelector('.turbo-quiz-loading');
      this.errorEl = container.querySelector('.turbo-quiz-error');
      this.errorMessageEl = container.querySelector('.turbo-quiz-error-message');
      this.containerEl = container.querySelector('.turbo-quiz-container');
      this.titleEl = container.querySelector('.turbo-quiz-title');
      this.descriptionEl = container.querySelector('.turbo-quiz-description');
      this.progressFillEl = container.querySelector('.turbo-quiz-progress-fill');
      this.progressCurrentEl = container.querySelector('.turbo-quiz-progress-text .current');
      this.progressTotalEl = container.querySelector('.turbo-quiz-progress-text .total');
      this.questionTextEl = container.querySelector('.turbo-quiz-question-text');
      this.answersEl = container.querySelector('.turbo-quiz-answers');
      this.questionEl = container.querySelector('.turbo-quiz-question');
      this.resultEl = container.querySelector('.turbo-quiz-result');
      this.resultContentEl = container.querySelector('.turbo-quiz-result-content');
      this.backBtn = container.querySelector('.turbo-quiz-back-btn');
      this.nextBtn = container.querySelector('.turbo-quiz-next-btn');
      this.retryBtn = container.querySelector('.turbo-quiz-retry-btn');
      this.restartBtn = container.querySelector('.turbo-quiz-restart-btn');

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
      const existingStyle = document.getElementById(`turbo-quiz-custom-css-${this.quizId}`);
      if (existingStyle) {
        existingStyle.textContent = css;
        return;
      }

      // Create new style element
      const styleElement = document.createElement('style');
      styleElement.id = `turbo-quiz-custom-css-${this.quizId}`;
      styleElement.textContent = css;
      document.head.appendChild(styleElement);
    }

    async init() {
      if (!this.quizId || !this.appUrl) {
        console.error('[SimpleProductQuiz] Missing quizId or appUrl');
        this.showError('Quiz ID or App URL not configured');
        return;
      }

      // Check if quiz was already completed
      const completedKey = `turbo_quiz_completed_${this.quizId}`;
      const wasCompleted = localStorage.getItem(completedKey);

      if (wasCompleted) {
        // Show the stored result from previous completion
        this.questionEl.style.display = 'none';
        this.resultEl.style.display = 'block';
        try {
          const resultData = JSON.parse(wasCompleted);
          this.resultContentEl.innerHTML = this.renderActionResult(resultData.actionType, resultData.actionData);
        } catch (e) {
          // Fallback for old format (just 'true' string)
          this.resultContentEl.innerHTML = '<p style="color: #666; font-style: italic;">Quiz already completed.</p>';
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

        // Track impression every time quiz is viewed
        this.trackImpression().catch(err => console.error('Impression tracking error:', err));

        // Start session in background without blocking render
        this.startSession().catch(err => console.error('Session start error:', err));
        this.renderQuiz();
      } catch (error) {
        console.error('[SimpleProductQuiz] Error loading quiz:', error);
        this.showError(error.message || 'Failed to load quiz. Please try again.');
      }
    }

    async startSession() {
      // Check if session already exists in cookie
      const existingSessionId = this.getCookie('turbo_quiz_session');

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
          this.setCookie('turbo_quiz_session', this.sessionId, 90);
        } else {
          console.error('[SimpleProductQuiz] Failed to start session:', data.error);
        }
      } catch (error) {
        console.error('[SimpleProductQuiz] Session start failed after retries:', error);
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
        console.error('[SimpleProductQuiz] Impression tracking failed after retries:', error);
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
        button.className = 'turbo-quiz-answer-btn';
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
      this.answersEl.querySelectorAll('.turbo-quiz-answer-btn').forEach((btn) => {
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
        console.error('[SimpleProductQuiz] Answer recording failed after retries:', error);
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
      // Get the final answer's action data
      const finalAnswer = this.answers[this.currentQuestionIndex];
      const actionData = finalAnswer.action_data;

      // Mark quiz as completed and store result in localStorage
      const completedKey = `turbo_quiz_completed_${this.quizId}`;
      const resultData = {
        actionType: finalAnswer.action_type,
        actionData: actionData
      };
      localStorage.setItem(completedKey, JSON.stringify(resultData));

      // Mark session as completed (with retry)
      if (this.sessionId) {
        try {
          await fetchWithRetry(`${this.appUrl}/api/quiz-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'complete',
              session_id: this.sessionId,
            }),
          });

          // Add session_id to cart attributes for order attribution
          await this.addSessionToCart(this.sessionId);
        } catch (error) {
          console.error('[SimpleProductQuiz] Session completion failed after retries:', error);
        }
      }

      // Render result based on action type
      this.resultContentEl.innerHTML = this.renderActionResult(finalAnswer.action_type, actionData);

      // Hide question, show result
      this.questionEl.style.display = 'none';
      this.resultEl.style.display = 'block';
      this.backBtn.style.display = 'none';
      this.nextBtn.style.display = 'none';
      if (this.restartBtn) this.restartBtn.style.display = 'none';

      // Show reset button for testing
      this.showResetButton();
    }

    showResetButton() {
      // Check if reset button already exists
      let resetBtn = this.container.querySelector('.turbo-quiz-reset-btn');
      if (!resetBtn) {
        resetBtn = document.createElement('button');
        resetBtn.className = 'turbo-quiz-reset-btn';
        resetBtn.textContent = 'Reset Quiz (Testing)';
        resetBtn.style.cssText = 'margin-top: 16px; padding: 8px 16px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 12px; color: #666;';
        resetBtn.addEventListener('click', () => this.resetForTesting());
        this.resultEl.appendChild(resetBtn);
      }
      resetBtn.style.display = 'block';
    }

    resetForTesting() {
      // Clear localStorage completion flag
      const completedKey = `turbo_quiz_completed_${this.quizId}`;
      localStorage.removeItem(completedKey);

      // Clear session cookie
      this.deleteCookie('turbo_quiz_session');

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
        <div class="turbo-quiz-text-result" style="background-color: ${backgroundColor}; color: ${textColor};">
          ${actionData.html || `<p>${actionData.text}</p>`}
        </div>
      `;
    }

    renderHtmlResult(actionData) {
      // Render raw HTML content
      return `
        <div class="turbo-quiz-html-result">
          ${actionData.html || ''}
        </div>
      `;
    }

    renderProductsResult(actionData) {
      const products = actionData.products || [];
      const customText = actionData.custom_text || 'Based on your answers, we recommend these products:';

      if (products.length === 0) {
        return '<p>No products available.</p>';
      }

      return `
        <div class="turbo-quiz-products-result">
          <p class="turbo-quiz-custom-text">${customText}</p>
          <div class="turbo-quiz-products-grid">
            ${products
              .map((product) => {
                const imageUrl = product.images?.[0]?.originalSrc || '';
                const price = product.variants?.[0]?.price || '';
                const handle = this.extractHandle(product.id);

                return `
                  <div class="turbo-quiz-product-card">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${product.title}" class="turbo-quiz-product-image" />` : ''}
                    <div class="turbo-quiz-product-info">
                      <h3 class="turbo-quiz-product-title">${product.title}</h3>
                      ${price ? `<p class="turbo-quiz-product-price">$${price}</p>` : ''}
                      <a href="/products/${handle}" class="turbo-quiz-shop-now-btn">Shop Now</a>
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

      if (collections.length === 0) {
        return '<p>No collections available.</p>';
      }

      return `
        <div class="turbo-quiz-collections-result">
          <p class="turbo-quiz-custom-text">${customText}</p>
          <div class="turbo-quiz-products-grid">
            ${collections
              .map((collection) => {
                const imageUrl = collection.image?.originalSrc || '';
                const handle = this.extractHandle(collection.id);

                return `
                  <div class="turbo-quiz-product-card">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${collection.title}" class="turbo-quiz-product-image" />` : ''}
                    <div class="turbo-quiz-product-info">
                      <h3 class="turbo-quiz-product-title">${collection.title}</h3>
                      <a href="/collections/${handle}" class="turbo-quiz-shop-now-btn">Shop Now</a>
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
        // Add quiz session ID as cart attribute for order attribution
        const response = await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attributes: {
              'turbo_quiz_session': sessionId,
              'quiz_id': this.quizId,
            },
          }),
        });

        if (!response.ok) {
          console.error('[SimpleProductQuiz] Failed to add session to cart:', await response.text());
        }
      } catch (error) {
        console.error('[SimpleProductQuiz] Error adding session to cart:', error);
      }
    }

    restart() {
      this.currentQuestionIndex = 0;
      this.answers = [];
      this.selectedAnswerId = null;
      // Clear session to create a new one on restart
      this.sessionId = null;
      this.deleteCookie('turbo_quiz_session');
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
    const quizContainers = document.querySelectorAll('.turbo-quiz-widget');
    quizContainers.forEach((container) => {
      new TurboQuiz(container);
    });
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizzes);
  } else {
    initQuizzes();
  }
})();
