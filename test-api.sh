#!/bin/bash

# Test if the quiz-sessions API is working
echo "Testing quiz-sessions API..."

# You'll need to replace this with your actual Cloudflare URL when the server is running
API_URL="${1:-https://hook-position-scripting-vii.trycloudflare.com}"

echo "Testing: $API_URL/api/quiz-sessions"

curl -X POST "$API_URL/api/quiz-sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "quiz_id": 1,
    "customer_id": null,
    "page_url": "https://test.myshopify.com",
    "user_agent": "test"
  }' \
  -w "\nHTTP Status: %{http_code}\n"
