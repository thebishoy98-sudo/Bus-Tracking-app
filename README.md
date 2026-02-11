# Bus Expense Tracker

A full-stack web application to track expenses and Turo income for your bus rental business.

## Features

- ✅ Add expenses paid by Allen, Bishoy, or received from Turo
- 📅 Automatic date tracking with manual override option
- 💾 Persistent SQLite database (data survives deployments)
- 📊 Comprehensive analytics dashboard
- 💰 Automatic 50/50 income splitting
- 📈 Break-even date projection based on booking trends
- 🎨 Modern, responsive UI

## Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the app:
```bash
python app.py
```

3. Open http://localhost:5000 in your browser

## Deploy to Render (Free)

### Option 1: Using Render's SQLite (Built-in Database)

1. Create a new Web Service on Render.com
2. Connect your GitHub repository
3. Configure:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
   - **Environment:** Python 3

That's it! The app will use SQLite by default, and Render provides persistent disk storage.

### Option 2: Using PostgreSQL (More Robust)

If you want a more robust database:

1. Create a PostgreSQL database on Render
2. Add this environment variable to your web service:
   - Key: `DATABASE_URL`
   - Value: (copy from your PostgreSQL database's "Internal Database URL")

3. Update requirements.txt to include:
```
psycopg2-binary==2.9.9
```

4. The app will automatically use PostgreSQL instead of SQLite

## How to Use

### Adding Expenses

1. Click "➕ Add Expense" tab
2. Fill in:
   - Item description (e.g., "Gas", "Tires", "Turo Payment")
   - Amount
   - Who paid (Allen/Bishoy) or Turo (for income)
   - Date (defaults to today, but can be changed)
3. Click "Add Expense"

### Viewing All Expenses

1. Click "📋 All Expenses" tab
2. See all transactions in a table
3. Delete any expense if needed

### Analytics Dashboard

The "📊 Analytics" tab shows:

**Summary Stats:**
- Total paid by Allen
- Total paid by Bishoy
- Total costs (Allen + Bishoy)
- Total Turo income

**Split Breakdown:**
- Allen's share (50% of Turo income)
- Bishoy's share (50% of Turo income)

**Net Position:**
- Allen's net = His share - What he paid
- Bishoy's net = His share - What he paid
- Positive = making profit, Negative = still in the red

**Break-Even Projection:**
- Average daily/monthly Turo income
- Projected break-even date
- Days until break-even

The projection uses your Turo payment history to calculate average daily income and estimates when you'll break even.

## Database Persistence

### On Render:

Render provides **persistent disk storage** for free tier web services. Your SQLite database will persist across deployments.

**Important:** Make sure you don't add the `bus_tracker.db` file to `.gitignore` if you want to keep your data in the repository. However, for production, the database file is created on Render's persistent disk automatically.

### Data Backup:

To backup your data:
1. Download the SQLite database file from your Render service
2. Or export data to CSV/JSON (you could add this feature)

## Tech Stack

- **Backend:** Flask (Python)
- **Database:** SQLite (with PostgreSQL option)
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Hosting:** Render.com (free tier)

## File Structure

```
bus-expense-tracker/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── Procfile              # Render deployment config
├── README.md             # This file
├── templates/
│   └── index.html        # Frontend UI
└── bus_tracker.db        # SQLite database (created on first run)
```

## Customization

### Change Split Ratio:
In `app.py`, find these lines and modify:
```python
allen_share = turo_income / 2  # Change to 0.6 for 60%
bishoy_share = turo_income / 2  # Change to 0.4 for 40%
```

### Add More Partners:
1. Add new option in HTML select: `<option value="NewPerson">New Person</option>`
2. Add calculations in `get_analytics()` function
3. Add new stat cards in the analytics section

## Support

If you encounter any issues:
1. Check Render logs for errors
2. Ensure all dependencies are installed
3. Verify DATABASE_URL is set correctly (if using PostgreSQL)

## Future Enhancements

Potential features to add:
- CSV export
- Monthly/yearly reports
- Expense categories
- Receipt uploads
- Email notifications
- Mobile app version
"# Bus-Tracking-app" 
