// Plan configuration and limits
export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    yearlyPrice: 0,
    quizLimit: 1,
    features: [
      "1 quiz",
      "Full analytics",
      "Revenue attribution",
      "Custom CSS",
    ],
  },
  starter: {
    name: "Starter",
    price: 12.99,
    yearlyPrice: 129, // $129/year = ~$10.75/mo, save 17%
    yearlySavings: 17,
    quizLimit: 5,
    features: [
      "5 quizzes",
      "Full analytics",
      "Revenue attribution",
      "Custom CSS",
      "Priority support",
    ],
  },
  growth: {
    name: "Growth",
    price: 49.99,
    yearlyPrice: 420, // $420/year = $35/mo, save 30%
    yearlySavings: 30,
    quizLimit: Infinity,
    recommended: true,
    features: [
      "Unlimited quizzes",
      "Full analytics",
      "Revenue attribution",
      "Custom CSS",
      "Priority support",
    ],
  },
};

/**
 * Check if a shop can create a new quiz based on their plan
 * @param {string} plan - The shop's current plan ("free", "starter", "growth")
 * @param {number} currentQuizCount - The number of quizzes the shop currently has
 * @returns {boolean} Whether the shop can create a new quiz
 */
export function canCreateQuiz(plan, currentQuizCount) {
  const planConfig = PLANS[plan] || PLANS.free;
  return currentQuizCount < planConfig.quizLimit;
}

/**
 * Get the quiz limit for a plan
 * @param {string} plan - The plan name
 * @returns {number} The quiz limit (Infinity for unlimited)
 */
export function getQuizLimit(plan) {
  const planConfig = PLANS[plan] || PLANS.free;
  return planConfig.quizLimit;
}

/**
 * Get remaining quizzes a shop can create
 * @param {string} plan - The shop's current plan
 * @param {number} currentQuizCount - Current number of quizzes
 * @returns {number} Number of quizzes remaining (Infinity for unlimited)
 */
export function getRemainingQuizzes(plan, currentQuizCount) {
  const limit = getQuizLimit(plan);
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - currentQuizCount);
}

/**
 * Get display text for quiz limit (e.g., "1/5" or "3/∞")
 * @param {string} plan - The shop's current plan
 * @param {number} currentQuizCount - Current number of quizzes
 * @returns {string} Display text for the limit
 */
export function getQuizLimitDisplay(plan, currentQuizCount) {
  const limit = getQuizLimit(plan);
  if (limit === Infinity) return `${currentQuizCount}`;
  return `${currentQuizCount}/${limit}`;
}
