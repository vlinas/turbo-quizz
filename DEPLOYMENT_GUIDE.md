# 🚀 Turbo Quizz - Heroku Deployment Guide

This guide will walk you through deploying your Turbo Quizz app to Heroku with a PostgreSQL database.

---

## ✅ Prerequisites

- [Heroku CLI installed](https://devcenter.heroku.com/articles/heroku-cli)
- Git installed
- New Heroku app created (✓ You've done this!)

---

## 📋 Step-by-Step Deployment

### 1️⃣ **Login to Heroku**

```bash
heroku login
```

This will open a browser window for authentication.

---

### 2️⃣ **Link Your Local Project to Heroku App**

```bash
# Replace 'your-heroku-app-name' with your actual Heroku app name
heroku git:remote -a your-heroku-app-name
```

**Example:**
```bash
heroku git:remote -a turbo-quizz-prod
```

You can verify it's linked by running:
```bash
git remote -v
```

You should see `heroku` listed with your app URL.

---

### 3️⃣ **Add PostgreSQL Database to Heroku**

```bash
heroku addons:create heroku-postgresql:essential-0
```

**What this does:**
- Creates a PostgreSQL database on Heroku
- Automatically sets the `DATABASE_URL` environment variable
- Essential-0 plan costs ~$5/month (you can start with `mini` for $5/month or `hobby-dev` for free testing)

**Check database was created:**
```bash
heroku addons
```

**Get your database URL:**
```bash
heroku config:get DATABASE_URL
```

---

### 4️⃣ **Set Environment Variables on Heroku**

You need to configure these environment variables for your Shopify app:

```bash
# Your Shopify App API Key
heroku config:set SHOPIFY_API_KEY=your_api_key_here

# Your Shopify App API Secret
heroku config:set SHOPIFY_API_SECRET=your_api_secret_here

# Your Shopify App Scopes (required permissions)
heroku config:set SCOPES=write_products,write_discounts

# Your app's host URL (will be: https://your-app-name.herokuapp.com)
heroku config:set HOST=https://your-heroku-app-name.herokuapp.com
```

**Example:**
```bash
heroku config:set SHOPIFY_API_KEY=1fe2dd3bca662d8337c9c7d02e9828e8
heroku config:set SHOPIFY_API_SECRET=55627062ede2a2492fb6d52d87608b57
heroku config:set SCOPES=write_products
heroku config:set HOST=https://turbo-quizz-prod.herokuapp.com
```

**Verify your config:**
```bash
heroku config
```

---

### 5️⃣ **Set Heroku Stack to Container (for Docker)**

Your app uses Docker, so set the stack:

```bash
heroku stack:set container
```

---

### 6️⃣ **Deploy Your App to Heroku**

```bash
# Commit all your changes
git add .
git commit -m "Initial Turbo Quizz setup with new database schema"

# Push to Heroku
git push heroku main
```

**If your default branch is named differently (e.g., 'master'):**
```bash
git push heroku master:main
```

---

### 7️⃣ **Check Deployment Status**

```bash
# View logs in real-time
heroku logs --tail

# Check if app is running
heroku ps

# Open your app in browser
heroku open
```

---

## 🗄️ Database Migration (IMPORTANT!)

Your `Procfile` is configured to run migrations automatically:

```
release: npx prisma migrate deploy
```

This means when you push to Heroku:
1. Docker builds your app
2. **Release phase**: Prisma migrations run (`npx prisma migrate deploy`)
3. **Web dyno starts**: Your app starts running

**The migration we created will:**
- ✅ Drop old discount tables
- ✅ Create new Quiz tables
- ✅ Set up all indexes and foreign keys

---

## 🔍 Verify Database Schema

After deployment, you can verify the database:

```bash
# Connect to your Heroku database
heroku pg:psql

# Once connected, list all tables:
\dt

# You should see:
# - Session
# - Quiz
# - Question
# - Answer
# - QuizSession
# - AnswerSelection
# - QuizAnalyticsSummary
# - _prisma_migrations

# Describe a table structure:
\d "Quiz"

# Exit:
\q
```

---

## 🧪 Test Database Connection Locally

To test with your Heroku database locally (useful for development):

```bash
# Get your DATABASE_URL
heroku config:get DATABASE_URL

# Update your local .env file with this URL temporarily
# Then run:
npm run dev
```

⚠️ **Warning:** Be careful testing against production database!

---

## 📊 Common Heroku Commands

```bash
# Restart your app
heroku restart

# Scale dynos (default is 1 web dyno)
heroku ps:scale web=1

# View app info
heroku apps:info

# View database info
heroku pg:info

# Create a database backup
heroku pg:backups:capture

# Download latest backup
heroku pg:backups:download

# Run Prisma commands on Heroku
heroku run npx prisma studio
heroku run npx prisma migrate status
```

---

## 🚨 Troubleshooting

### Issue: "Permission denied to create database"

**Solution:** This happens during local development. For Heroku deployment, migrations run automatically.

### Issue: "Error: P1001: Can't reach database server"

**Solutions:**
1. Check DATABASE_URL is set: `heroku config:get DATABASE_URL`
2. Verify PostgreSQL addon is active: `heroku addons`
3. Check app logs: `heroku logs --tail`

### Issue: "Build failed"

**Solutions:**
1. Check heroku.yml is correct
2. Verify Dockerfile exists
3. Check logs: `heroku logs --tail`

### Issue: "Application error"

**Solutions:**
1. Check environment variables: `heroku config`
2. View logs: `heroku logs --tail`
3. Restart: `heroku restart`

---

## 🔄 Deploying Updates

After making code changes:

```bash
# 1. Test locally
npm run dev

# 2. Commit changes
git add .
git commit -m "Your commit message"

# 3. Push to Heroku (migrations run automatically)
git push heroku main

# 4. Check logs
heroku logs --tail
```

---

## 💰 Cost Breakdown

- **Heroku Dyno (Basic):** $7/month
- **PostgreSQL (Essential-0):** $5/month
- **Total:** ~$12/month

**Free tier option (for testing):**
- Use `eco` dynos (free 1000 hours/month shared across apps)
- Use `hobby-dev` PostgreSQL (free, 10k rows limit)

```bash
# For free tier:
heroku addons:create heroku-postgresql:hobby-dev
```

---

## 📝 Next Steps

After deployment:

1. ✅ Update your Shopify Partner Dashboard with your Heroku app URL
2. ✅ Test the app installation on a development store
3. ✅ Build the quiz admin UI
4. ✅ Build the storefront quiz widget
5. ✅ Set up analytics tracking

---

## 🆘 Need Help?

- **Heroku Docs:** https://devcenter.heroku.com/
- **Prisma Docs:** https://www.prisma.io/docs
- **Heroku Status:** https://status.heroku.com/

---

## 📌 Quick Reference

```bash
# Essential commands you'll use most:
heroku login                    # Login to Heroku
heroku logs --tail             # View logs
heroku restart                 # Restart app
heroku pg:info                 # Database info
heroku config                  # View all env vars
git push heroku main           # Deploy updates
heroku run npx prisma studio   # Open database GUI
```

---

**Good luck with your deployment! 🎉**
