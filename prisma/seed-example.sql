-- ============================================
-- SEED DATA FOR TESTING TURBO QUIZZ
-- ============================================
-- This file contains example data to test your quiz app
-- Run this after deploying to Heroku: heroku pg:psql < prisma/seed-example.sql
-- Or connect to database and paste sections manually

-- ============================================
-- 1. CREATE SAMPLE QUIZ
-- ============================================

-- Insert a sample quiz
INSERT INTO "Quiz" (
  shop,
  quiz_id,
  title,
  description,
  status,
  display_on_pages,
  theme_settings,
  created_at,
  updated_at
) VALUES (
  'example-store.myshopify.com',
  'quiz-001',
  'Find Your Perfect Product',
  'Answer a few questions to discover products that match your style',
  'active',
  ARRAY['product', 'home'],
  '{"primaryColor": "#6366f1", "buttonStyle": "rounded"}'::jsonb,
  NOW(),
  NOW()
);

-- ============================================
-- 2. CREATE QUESTIONS
-- ============================================

-- Question 1
INSERT INTO "Question" (
  quiz_id,
  question_id,
  question_text,
  "order",
  created_at,
  updated_at
) VALUES (
  'quiz-001',
  'q1-style',
  'What''s your style preference?',
  1,
  NOW(),
  NOW()
);

-- Question 2
INSERT INTO "Question" (
  quiz_id,
  question_id,
  question_text,
  "order",
  created_at,
  updated_at
) VALUES (
  'quiz-001',
  'q2-usage',
  'How will you use this product?',
  2,
  NOW(),
  NOW()
);

-- ============================================
-- 3. CREATE ANSWERS FOR QUESTION 1
-- ============================================

-- Answer 1.1: Minimalist
INSERT INTO "Answer" (
  question_id,
  answer_id,
  answer_text,
  "order",
  action_type,
  action_data,
  created_at,
  updated_at
) VALUES (
  'q1-style',
  'a1-minimalist',
  'Minimalist & Clean',
  1,
  'show_text',
  '{
    "type": "show_text",
    "text": "Great choice! You appreciate simplicity and elegance.",
    "styling": {
      "backgroundColor": "#f8f9fa",
      "textColor": "#212529"
    }
  }'::jsonb,
  NOW(),
  NOW()
);

-- Answer 1.2: Bold
INSERT INTO "Answer" (
  question_id,
  answer_id,
  answer_text,
  "order",
  action_type,
  action_data,
  created_at,
  updated_at
) VALUES (
  'q1-style',
  'a1-bold',
  'Bold & Colorful',
  2,
  'show_products',
  '{
    "type": "show_products",
    "product_ids": ["gid://shopify/Product/123456", "gid://shopify/Product/789012"],
    "display_style": "grid",
    "columns": 2,
    "show_prices": true,
    "show_add_to_cart": true
  }'::jsonb,
  NOW(),
  NOW()
);

-- ============================================
-- 4. CREATE ANSWERS FOR QUESTION 2
-- ============================================

-- Answer 2.1: Everyday
INSERT INTO "Answer" (
  question_id,
  answer_id,
  answer_text,
  "order",
  action_type,
  action_data,
  created_at,
  updated_at
) VALUES (
  'q2-usage',
  'a2-everyday',
  'Everyday Use',
  1,
  'show_collections',
  '{
    "type": "show_collections",
    "collection_ids": ["gid://shopify/Collection/111222"],
    "display_style": "carousel",
    "products_per_collection": 4,
    "show_collection_title": true
  }'::jsonb,
  NOW(),
  NOW()
);

-- Answer 2.2: Special Occasions
INSERT INTO "Answer" (
  question_id,
  answer_id,
  answer_text,
  "order",
  action_type,
  action_data,
  created_at,
  updated_at
) VALUES (
  'q2-usage',
  'a2-special',
  'Special Occasions',
  2,
  'show_text',
  '{
    "type": "show_text",
    "text": "Perfect! Let me show you our premium collection.",
    "html": "<h3>Premium Collection</h3><p>Handpicked items for those special moments.</p>"
  }'::jsonb,
  NOW(),
  NOW()
);

-- ============================================
-- 5. CREATE SAMPLE QUIZ SESSIONS
-- ============================================

-- Session 1: Completed
INSERT INTO "QuizSession" (
  session_id,
  quiz_id,
  shop,
  started_at,
  completed_at,
  is_completed,
  page_url,
  user_agent
) VALUES (
  'session-001',
  'quiz-001',
  'example-store.myshopify.com',
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '30 minutes',
  true,
  'https://example-store.myshopify.com/',
  'Mozilla/5.0'
);

-- Session 2: In Progress
INSERT INTO "QuizSession" (
  session_id,
  quiz_id,
  shop,
  started_at,
  is_completed,
  page_url
) VALUES (
  'session-002',
  'quiz-001',
  'example-store.myshopify.com',
  NOW() - INTERVAL '5 minutes',
  false,
  'https://example-store.myshopify.com/products/example'
);

-- ============================================
-- 6. CREATE ANSWER SELECTIONS
-- ============================================

-- Selections for completed session
INSERT INTO "AnswerSelection" (
  session_id,
  answer_id,
  question_id,
  quiz_id,
  shop,
  selected_at
) VALUES
  (
    'session-001',
    'a1-minimalist',
    'q1-style',
    'quiz-001',
    'example-store.myshopify.com',
    NOW() - INTERVAL '55 minutes'
  ),
  (
    'session-001',
    'a2-everyday',
    'q2-usage',
    'quiz-001',
    'example-store.myshopify.com',
    NOW() - INTERVAL '30 minutes'
  );

-- Selection for in-progress session
INSERT INTO "AnswerSelection" (
  session_id,
  answer_id,
  question_id,
  quiz_id,
  shop,
  selected_at
) VALUES (
  'session-002',
  'a1-bold',
  'q1-style',
  'quiz-001',
  'example-store.myshopify.com',
  NOW() - INTERVAL '3 minutes'
);

-- ============================================
-- 7. CREATE ANALYTICS SUMMARY
-- ============================================

-- Sample daily analytics
INSERT INTO "QuizAnalyticsSummary" (
  quiz_id,
  shop,
  date,
  impressions,
  starts,
  completions,
  created_at,
  updated_at
) VALUES
  (
    'quiz-001',
    'example-store.myshopify.com',
    CURRENT_DATE - INTERVAL '2 days',
    150,
    45,
    32,
    NOW(),
    NOW()
  ),
  (
    'quiz-001',
    'example-store.myshopify.com',
    CURRENT_DATE - INTERVAL '1 day',
    200,
    60,
    48,
    NOW(),
    NOW()
  ),
  (
    'quiz-001',
    'example-store.myshopify.com',
    CURRENT_DATE,
    100,
    30,
    20,
    NOW(),
    NOW()
  );

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these queries to verify your seed data:

-- Count all records
SELECT 'Quizzes' as table_name, COUNT(*) as count FROM "Quiz"
UNION ALL
SELECT 'Questions', COUNT(*) FROM "Question"
UNION ALL
SELECT 'Answers', COUNT(*) FROM "Answer"
UNION ALL
SELECT 'QuizSessions', COUNT(*) FROM "QuizSession"
UNION ALL
SELECT 'AnswerSelections', COUNT(*) FROM "AnswerSelection"
UNION ALL
SELECT 'Analytics', COUNT(*) FROM "QuizAnalyticsSummary";

-- View quiz with questions and answers
SELECT
  q.title as quiz_title,
  qu.question_text,
  qu."order" as question_order,
  a.answer_text,
  a."order" as answer_order,
  a.action_type
FROM "Quiz" q
JOIN "Question" qu ON qu.quiz_id = q.quiz_id
JOIN "Answer" a ON a.question_id = qu.question_id
ORDER BY qu."order", a."order";

-- View completion rate
SELECT
  quiz_id,
  COUNT(*) as total_starts,
  SUM(CASE WHEN is_completed THEN 1 ELSE 0 END) as completions,
  ROUND(
    100.0 * SUM(CASE WHEN is_completed THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as completion_rate_percent
FROM "QuizSession"
GROUP BY quiz_id;

-- View answer popularity
SELECT
  q.question_text,
  a.answer_text,
  COUNT(asel.id) as selection_count
FROM "AnswerSelection" asel
JOIN "Answer" a ON a.answer_id = asel.answer_id
JOIN "Question" q ON q.question_id = asel.question_id
GROUP BY q.question_text, a.answer_text
ORDER BY q.question_text, selection_count DESC;
