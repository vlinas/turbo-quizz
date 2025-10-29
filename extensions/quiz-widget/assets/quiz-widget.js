(function () {
  'use strict';

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

    async init() {
      if (!this.quizId || !this.appUrl) {
        this.showError('Quiz ID or App URL not configured');
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
      this.showLoading();

      try {
        const response = await fetch(`${this.appUrl}/api/quiz/${this.quizId}`);
        const data = await response.json();

        if (!data.success || !data.quiz) {
          throw new Error(data.error || 'Failed to load quiz');
        }

        this.quiz = data.quiz;
        await this.startSession();
        this.renderQuiz();
      } catch (error) {
        console.error('Error loading quiz:', error);
        this.showError(error.message || 'Failed to load quiz. Please try again.');
      }
    }

    async startSession() {
      try {
        const response = await fetch(`${this.appUrl}/api/quiz-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            quiz_id: this.quizId,
            page_url: window.location.href,
            user_agent: navigator.userAgent,
          }),
        });

        const data = await response.json();

        if (data.success && data.session_id) {
          this.sessionId = data.session_id;
        } else {
          console.error('Failed to start session:', data.error);
        }
      } catch (error) {
        console.error('Error starting session:', error);
      }
    }

    renderQuiz() {
      this.hideLoading();
      this.hideError();
      this.containerEl.style.display = 'block';

      // Set quiz header
      this.titleEl.textContent = this.quiz.title;
      this.descriptionEl.textContent = this.quiz.description || '';
      this.progressTotalEl.textContent = this.quiz.questions.length;

      // Show first question
      this.renderQuestion();
    }

    renderQuestion() {
      const question = this.quiz.questions[this.currentQuestionIndex];

      // Update progress
      const progress = ((this.currentQuestionIndex + 1) / this.quiz.questions.length) * 100;
      this.progressFillEl.style.width = `${progress}%`;
      this.progressCurrentEl.textContent = this.currentQuestionIndex + 1;

      // Update question
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

      // Update navigation
      this.backBtn.style.display = this.currentQuestionIndex > 0 ? 'inline-block' : 'none';
      this.nextBtn.disabled = true;
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
      this.nextBtn.disabled = false;

      // Store answer for this question
      this.answers[this.currentQuestionIndex] = answer;

      // Record answer in backend
      this.recordAnswer(answer);
    }

    async recordAnswer(answer) {
      if (!this.sessionId) return;

      const question = this.quiz.questions[this.currentQuestionIndex];

      try {
        await fetch(`${this.appUrl}/api/quiz-sessions`, {
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
        console.error('Error recording answer:', error);
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
      // Mark session as completed
      if (this.sessionId) {
        try {
          await fetch(`${this.appUrl}/api/quiz-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'complete',
              session_id: this.sessionId,
            }),
          });
        } catch (error) {
          console.error('Error completing session:', error);
        }
      }

      // Get the final answer's action data
      const finalAnswer = this.answers[this.currentQuestionIndex];
      const actionData = finalAnswer.action_data;

      // Render result based on action type
      this.resultContentEl.innerHTML = this.renderActionResult(finalAnswer.action_type, actionData);

      // Hide question, show result
      this.questionEl.style.display = 'none';
      this.resultEl.style.display = 'block';
      this.backBtn.style.display = 'none';
      this.nextBtn.style.display = 'none';
    }

    renderActionResult(actionType, actionData) {
      switch (actionType) {
        case 'show_text':
          return this.renderTextResult(actionData);
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

    renderProductsResult(actionData) {
      const productIds = actionData.product_ids || [];
      const displayStyle = actionData.display_style || 'grid';

      // Note: In a real implementation, you would fetch product data from Shopify
      // For now, we'll show product IDs with links
      return `
        <div class="turbo-quiz-products-result">
          <h3>Recommended Products</h3>
          <p class="turbo-quiz-info">Based on your answers, we recommend these products:</p>
          <div class="turbo-quiz-products ${displayStyle}">
            ${productIds
              .map(
                (id) => `
              <div class="turbo-quiz-product-card">
                <p>Product ID: ${id}</p>
                <a href="/products/${id}" class="turbo-quiz-product-link">View Product</a>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    renderCollectionsResult(actionData) {
      const collectionIds = actionData.collection_ids || [];

      return `
        <div class="turbo-quiz-collections-result">
          <h3>Recommended Collections</h3>
          <p class="turbo-quiz-info">Based on your answers, check out these collections:</p>
          <div class="turbo-quiz-collections">
            ${collectionIds
              .map(
                (id) => `
              <div class="turbo-quiz-collection-card">
                <p>Collection ID: ${id}</p>
                <a href="/collections/${id}" class="turbo-quiz-collection-link">Browse Collection</a>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    restart() {
      this.currentQuestionIndex = 0;
      this.answers = [];
      this.selectedAnswerId = null;
      this.sessionId = null;
      this.renderQuiz();
      this.startSession();
      this.nextBtn.style.display = 'inline-block';
    }

    showLoading() {
      this.loadingEl.style.display = 'block';
      this.errorEl.style.display = 'none';
      this.containerEl.style.display = 'none';
    }

    hideLoading() {
      this.loadingEl.style.display = 'none';
    }

    showError(message) {
      this.errorMessageEl.textContent = message;
      this.errorEl.style.display = 'block';
      this.loadingEl.style.display = 'none';
      this.containerEl.style.display = 'none';
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
