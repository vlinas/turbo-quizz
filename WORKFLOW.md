# Development Workflow: Staging → Production

This guide explains how to safely develop on staging and promote changes to production without any mix-ups.

## Branch Strategy

```
staging branch → develop and test here
     ↓
   merge to
     ↓
main branch → production deployments only
```

## Safe Development Workflow

### 1. **Always Start on Staging Branch**

```bash
git checkout staging
git pull origin staging
```

### 2. **Make Your Changes on Staging**

- Write code, fix bugs, add features
- Commit your changes regularly:

```bash
git add .
git commit -m "Your commit message"
git push origin staging
```

### 3. **Deploy to Staging for Testing**

```bash
npm run deploy:staging
```

**Verify deployment:**
- Check output shows: "Product Quiz - Staging"
- Check URL shows: `https://turbo-quizz-staging-4bd0e4ee4b32.herokuapp.com`
- Test the app thoroughly on staging

### 4. **When Ready for Production**

**Only merge to main when:**
- ✅ Changes are fully tested on staging
- ✅ All features work as expected
- ✅ No errors or bugs found
- ✅ You're confident it won't break production

**Merge staging → main:**

```bash
git checkout main
git pull origin main
git merge staging
git push origin main
```

### 5. **Deploy to Production**

```bash
npm run deploy:production
```

**Verify deployment:**
- Check output shows: "Simple Product Quiz Survey"
- Check URL shows: `https://turbo-quizz-1660bbe41f52.herokuapp.com`
- Monitor production for any issues

## Golden Rules

### ✅ DO:
- Always develop on `staging` branch
- Always test on staging before merging to main
- Always use `npm run deploy:staging` for staging
- Always use `npm run deploy:production` for production
- Keep staging and main branches in sync (merge staging → main regularly)

### ❌ DON'T:
- Don't develop directly on `main` branch
- Don't deploy to production without testing on staging first
- Don't use generic `npm run deploy` (it's disabled for safety)
- Don't merge main → staging (always go staging → main)
- Don't skip testing on staging

## Quick Reference

| Action | Command | Branch |
|--------|---------|--------|
| Start development | `git checkout staging` | staging |
| Deploy for testing | `npm run deploy:staging` | staging |
| Promote to production | `git checkout main && git merge staging` | main |
| Deploy to production | `npm run deploy:production` | main |

## Emergency Rollback

If something breaks in production:

```bash
# 1. Check recent commits
git log --oneline -n 10

# 2. Revert to previous working commit
git checkout main
git revert <commit-hash>
git push origin main

# 3. Redeploy production
npm run deploy:production
```

## Environment Separation

**Staging:**
- Branch: `staging`
- Heroku: `turbo-quizz-staging`
- Shopify App: "Product Quiz - Staging"
- Database: Staging database (separate from production)

**Production:**
- Branch: `main`
- Heroku: `turbo-quizz`
- Shopify App: "Simple Product Quiz Survey"
- Database: Production database (live customer data)

**Key Point:** The staging and production environments are completely separate. They have different databases, different Shopify apps, and different Heroku instances. Changes on staging cannot affect production until you explicitly merge and deploy.
