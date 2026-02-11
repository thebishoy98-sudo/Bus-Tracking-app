# Quick Deployment Guide

## Deploy to Render in 5 Minutes

1. **Push to GitHub:**
   - Create a new repository on GitHub
   - Push all these files to the repository

2. **Create Render Account:**
   - Go to https://render.com
   - Sign up for free (use your GitHub account)

3. **Create New Web Service:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Fill in:
     - **Name:** bus-expense-tracker (or anything you want)
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `gunicorn app:app`
     - **Instance Type:** Free

4. **Deploy:**
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment
   - Your app will be live at: `https://your-app-name.onrender.com`

## Database Persistence on Render

**Good news!** Render's free tier now includes persistent disk storage, so your SQLite database will NOT be cleared when you redeploy. Your data is safe!

However, if you want extra security, you can also:

### Option A: Use PostgreSQL (recommended for production)

1. In Render dashboard, create a new PostgreSQL database (also free)
2. Copy the "Internal Database URL"
3. In your web service, go to "Environment"
4. Add environment variable:
   - Key: `DATABASE_URL`
   - Value: (paste the Internal Database URL)
5. Add to requirements.txt: `psycopg2-binary==2.9.9`
6. Redeploy

### Option B: Keep using SQLite (easier)

Just deploy as-is! The database file will persist on Render's disk.

## Testing Locally (Optional)

If you want to test before deploying:

```bash
# Install dependencies
pip install -r requirements.txt

# Run the app
python app.py

# Open browser to http://localhost:5000
```

## First-Time Setup

After deployment:

1. Go to your Render URL
2. Click "Add Expense" tab
3. Add your first expense
4. Check the "Analytics" tab to see calculations

## Importing Your Current Data

To import the data from your Google Sheet:

1. Go to "Add Expense" tab
2. Add each expense manually (or I can create a CSV import feature if you want)

Example from your sheet:
- Bus Purchase: Allen paid $5,500, Bishoy paid $4,700
- Tires: Bishoy paid $400
- Fligh ticket: Bishoy paid $390
- Turo Dec 27 2025: Turo paid $431
- etc.

## Tips

- **Bookmark the URL** for easy access
- **Share with Allen** - both of you can use it simultaneously
- **Mobile friendly** - works great on phones
- **No login required** - just use the URL (keep it private!)

## Future Enhancements I Can Add

Let me know if you want:
- CSV import/export
- Password protection
- Email notifications
- Receipt uploads
- Expense categories
- Charts/graphs
- Monthly reports
- Different split ratios per expense
