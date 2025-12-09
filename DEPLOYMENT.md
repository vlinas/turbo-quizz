# Deployment Guide

## ⚠️ IMPORTANT: Preventing Production/Staging Mix-ups

This guide ensures you never accidentally deploy to the wrong environment.

## Environment Structure

We have two separate environments:

### Production
- **App Name:** Simple Product Quiz Survey
- **Client ID:** `b6946453d658cb87dd6962999aec6fd0`
- **Heroku:** `turbo-quizz`
- **URL:** https://turbo-quizz-1660bbe41f52.herokuapp.com
- **Config File:** `shopify.app.toml`
- **Env File:** `.env.production`

### Staging
- **App Name:** Product Quiz - Staging
- **Client ID:** `5a35555b83652bfd2816f258dd1145e8`
- **Heroku:** `turbo-quizz-staging`
- **URL:** https://turbo-quizz-staging-4bd0e4ee4b32.herokuapp.com
- **Config File:** `shopify.app.staging.toml`
- **Env File:** `.env.staging`

## Safe Deployment Commands

### Deploy to Production
```bash
npm run deploy:production
```

### Deploy to Staging
```bash
npm run deploy:staging
```

### ⛔ DO NOT USE
```bash
npm run deploy                    # ❌ This will show an error - always specify environment
shopify app deploy                # ❌ Can deploy to wrong app due to CLI cache
npx shopify app deploy            # ❌ Can deploy to wrong app due to CLI cache
```

## Pre-Deployment Checklist

Before deploying to **production**, verify:
- [ ] Code has been tested on staging
- [ ] All tests are passing
- [ ] Database migrations are safe
- [ ] Environment variables are correct in Heroku

Before deploying to **staging**, verify:
- [ ] You're on the correct git branch
- [ ] You want to test new features

## Verification After Deployment

After deploying, always verify you deployed to the correct environment:

1. Check the deployment output for the app name:
   - Production should show: "Simple Product Quiz Survey"
   - Staging should show: "Product Quiz - Staging"

2. Check the app URL in the output:
   - Production: https://turbo-quizz-1660bbe41f52.herokuapp.com
   - Staging: https://turbo-quizz-staging-4bd0e4ee4b32.herokuapp.com

3. Visit the Shopify Partners dashboard to confirm

## Troubleshooting

### If you accidentally deployed to the wrong environment:

1. **Don't panic** - you can revert the deployment
2. Check Shopify Partners dashboard to see which app was affected
3. Deploy the correct version to the affected environment
4. If production was affected, notify the team immediately

### Clearing Shopify CLI Cache

If you're experiencing issues with the wrong app being selected:

```bash
rm -rf ~/.config/shopify
```

Then re-run your deployment with the explicit config flag.

## Best Practices

1. **Always use npm scripts** - `npm run deploy:production` or `npm run deploy:staging`
2. **Never skip the environment suffix** - The base `deploy` command is intentionally disabled
3. **Double-check before deploying** - Look at the command you're about to run
4. **Review deployment output** - Confirm the app name and URL match your intention
5. **Keep .env files separate** - We maintain `.env.production` and `.env.staging`
6. **Version control** - Both `.toml` config files are tracked in git
