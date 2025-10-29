# 🚀 Quick Start Guide - Turbo Quizz

## 📦 What's Been Done

✅ Database schema converted from discount app to quiz app
✅ TypeScript types created
✅ Migration files ready
✅ App renamed to "Turbo Quizz"
✅ Seed data scripts created
✅ Documentation written

---

## 🎯 Deploy to Heroku (10 minutes)

### Step 1: Link to Heroku
```bash
heroku git:remote -a your-heroku-app-name
```

### Step 2: Add PostgreSQL
```bash
heroku addons:create heroku-postgresql:essential-0
```

### Step 3: Set Environment Variables
```bash
heroku config:set SHOPIFY_API_KEY=your_key_here
heroku config:set SHOPIFY_API_SECRET=your_secret_here
heroku config:set HOST=https://your-app-name.herokuapp.com
heroku config:set SCOPES=write_products
```

### Step 4: Set Stack & Deploy
```bash
heroku stack:set container
git add .
git commit -m "Initial Turbo Quizz deployment"
git push heroku main
```

### Step 5: Verify
```bash
heroku logs --tail
heroku pg:psql
# Inside psql:
\dt  # Should show: Quiz, Question, Answer, QuizSession, etc.
\q
```

---

## 🧪 Add Test Data (Optional)

### Option A: TypeScript Seed (Recommended for Local)
```bash
npm install
npm run db:seed
```

### Option B: SQL Seed (For Heroku)
```bash
heroku pg:psql < prisma/seed-example.sql
```

---

## 📖 Full Documentation

- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Complete Heroku deployment instructions
- **[CONVERSION_SUMMARY.md](CONVERSION_SUMMARY.md)** - Detailed explanation of all changes
- **[prisma/schema.prisma](prisma/schema.prisma)** - Database schema
- **[app/types/quiz.types.ts](app/types/quiz.types.ts)** - TypeScript types

---

## 🛠️ What to Build Next

### Phase 1: Backend API (Week 1)
Create REST API routes for quiz CRUD operations:
- `app/routes/api.quizzes.jsx` - List/create quizzes
- `app/routes/api.quizzes.$id.jsx` - Get/update/delete quiz
- `app/routes/api.questions.jsx` - Manage questions
- `app/routes/api.answers.jsx` - Manage answers

### Phase 2: Admin Dashboard (Week 2)
Build merchant-facing UI:
- Quiz list page (replace discount dashboard)
- Quiz creation form
- Question & answer builder
- Analytics dashboard

### Phase 3: Storefront Widget (Week 3)
Create customer-facing quiz:
- Theme extension widget
- Question display
- Answer selection
- Action execution (show text/products/collections)

---

## 🗂️ Key Files

```
turbo-quizz/
├── prisma/
│   ├── schema.prisma              ← New quiz models
│   ├── seed.ts                    ← Test data (TypeScript)
│   ├── seed-example.sql           ← Test data (SQL)
│   └── migrations/
│       └── 20250129000000_convert_to_quiz_app/
│           └── migration.sql      ← Database migration
│
├── app/
│   └── types/
│       └── quiz.types.ts          ← TypeScript types
│
├── QUICKSTART.md                  ← This file
├── DEPLOYMENT_GUIDE.md            ← Detailed Heroku guide
└── CONVERSION_SUMMARY.md          ← Complete explanation
```

---

## 💡 Database Schema at a Glance

```
Quiz (main quiz entity)
 └── Questions (unlimited)
      └── Answers (2 per question)
           └── AnswerSelections (tracking)

QuizSession (user sessions)
 └── AnswerSelections

QuizAnalyticsSummary (daily metrics)
```

---

## 🎨 Action Types Explained

When a user selects an answer, one of these actions happens:

### 1. Show Text
Display custom text/HTML on the page
```typescript
{
  type: "show_text",
  text: "You picked minimalist!",
  styling: { backgroundColor: "#f0f0f0" }
}
```

### 2. Show Products
Display specific Shopify products
```typescript
{
  type: "show_products",
  product_ids: ["gid://shopify/Product/123"],
  display_style: "grid"
}
```

### 3. Show Collections
Display products from collections
```typescript
{
  type: "show_collections",
  collection_ids: ["gid://shopify/Collection/456"],
  display_style: "carousel"
}
```

---

## 🆘 Troubleshooting

### "Build failed on Heroku"
```bash
heroku logs --tail
# Check for missing env vars or Docker issues
```

### "Can't connect to database"
```bash
heroku config:get DATABASE_URL
# Verify it starts with postgres://
```

### "Migration failed"
```bash
heroku run npx prisma migrate status
heroku run npx prisma migrate deploy
```

---

## ✅ Checklist

Before deployment:
- [ ] Created Heroku app
- [ ] Have Shopify API credentials ready
- [ ] Reviewed database schema

After deployment:
- [ ] PostgreSQL addon added
- [ ] Environment variables set
- [ ] App deployed successfully
- [ ] Database tables created (verified with `\dt`)
- [ ] Test data added (optional)

Next steps:
- [ ] Build API routes for quiz CRUD
- [ ] Build admin dashboard UI
- [ ] Build storefront quiz widget
- [ ] Test on development store

---

## 📞 Quick Commands

```bash
# Deploy
git push heroku main

# View logs
heroku logs --tail

# Database console
heroku pg:psql

# Restart app
heroku restart

# Add test data
npm run db:seed
```

---

**Ready to deploy? Start with Step 1 above! 🚀**

Questions? Check [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.
