# Bus Expense Tracker - Visual Guide

## 🎨 User Interface Overview

### Tab 1: Add Expense
```
┌─────────────────────────────────────────────────────┐
│  ➕ Add Expense  │  📋 All Expenses  │  📊 Analytics │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Add New Expense                                    │
│                                                     │
│  Item/Description: [Tires              ]            │
│  Amount ($):       [400.00             ]            │
│                                                     │
│  Paid By:          [Bishoy        ▼]                │
│  Date:             [2026-02-11    📅]               │
│                                                     │
│  ┌───────────────────────────────────┐              │
│  │       Add Expense                 │              │
│  └───────────────────────────────────┘              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Pre-filled with today's date (can be changed)
- Dropdown for Allen/Bishoy/Turo
- Simple, clean form
- One-click submit

---

### Tab 2: All Expenses
```
┌─────────────────────────────────────────────────────┐
│  ➕ Add Expense  │  📋 All Expenses  │  📊 Analytics │
├─────────────────────────────────────────────────────┤
│                                                     │
│  All Expenses                                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Date       │ Item          │ Amount  │ Paid  │  │
│  ├──────────────────────────────────────────────┤  │
│  │ 2026-02-11 │ Bus Purchase  │ $5,500  │ Allen │  │
│  │ 2026-02-11 │ Bus Purchase  │ $4,700  │Bishoy │  │
│  │ 2026-02-11 │ Tires         │  $400   │Bishoy │  │
│  │ 2025-12-27 │ Turo Payment  │  $431   │ Turo  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Sortable table
- Color-coded badges (Allen=Blue, Bishoy=Purple, Turo=Green)
- Delete button for each expense
- Shows all transactions chronologically

---

### Tab 3: Analytics Dashboard
```
┌─────────────────────────────────────────────────────┐
│  ➕ Add Expense  │  📋 All Expenses  │  📊 Analytics │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Financial Analytics                                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Allen Paid   │  │ Bishoy Paid  │  │Total Cost│  │
│  │   $5,500.00  │  │   $4,700.00  │  │$10,200.00│  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ Turo Income  │  │              │                │
│  │   $1,626.00  │  │              │                │
│  └──────────────┘  └──────────────┘                │
│                                                     │
│  Split Breakdown (50/50)                            │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ Allen Share  │  │ Bishoy Share │                │
│  │    $813.00   │  │    $813.00   │                │
│  └──────────────┘  └──────────────┘                │
│                                                     │
│  Net Position (Share - Paid)                        │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ Allen's Net  │  │ Bishoy's Net │                │
│  │  -$4,687.00  │  │  -$3,887.00  │                │
│  │ In the red   │  │ In the red   │                │
│  └──────────────┘  └──────────────┘                │
│                                                     │
│  📈 Break-Even Projection                           │
│  ┌───────────────────────────────────────────────┐ │
│  │ Average Daily Income:    $50.00               │ │
│  │ Average Monthly Income:  $1,500.00            │ │
│  │ Days Until Break-Even:   172 days             │ │
│  │ Projected Break-Even:    August 2, 2026       │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Color-coded cards (Orange=Expenses, Green=Income, Blue=Shares)
- Automatic calculations
- Visual indicators (red/green for net position)
- Smart projections based on Turo payment history
- Shows when you'll break even!

---

## 📊 How Calculations Work

### Current Example (Based on Your Sheet):

**Expenses:**
- Allen paid: $5,500 (Bus Purchase) + $647.60 (Reg) + $65 (Misc) + $11 (Sun pass) + $335 (Cameras) + $1,000 (Wrap) = **$7,558.60**
- Bishoy paid: $4,700 (Bus) + $400 (Tires) + $390 (Flight) + $43.47 (Lyft) + $72.03 (Walmart) + $785.46 (Gas) + $211.02 (Food) + $23.56 (Oil pan) + $57.76 (Oil change) + $11.76 (Oil filter) + $10.69 (RTV) + $145 (Radio) + $26.50 (Diesel) + $45 (Belt) + $350 (Tires) = **$7,272.25**

**Total Costs:** $14,830.85

**Turo Income (from your sheet):**
- Dec 27 2025: $431
- Jan 19: $159.70
- Feb 2: $594.60
- Feb 8: $440.64
**Total:** $1,625.94

**Split 50/50:**
- Allen's share: $812.97
- Bishoy's share: $812.97

**Net Position:**
- Allen: $812.97 - $7,558.60 = **-$6,745.63** (still in the red)
- Bishoy: $812.97 - $7,272.25 = **-$6,459.28** (still in the red)

**Projection:**
Based on 4 Turo payments over ~43 days:
- Daily average: ~$37.81
- Monthly average: ~$1,134.30
- Remaining to break even: $14,830.85 - $1,625.94 = $13,204.91
- Days to break even: ~349 days
- Projected break-even date: ~January 2027

---

## 💡 Pro Tips

1. **Enter data regularly** - Don't wait! Add expenses as they happen
2. **Use the date picker** - If you're catching up, adjust the dates
3. **Turo payments** - Mark all Turo income as "Turo" paid by
4. **Check analytics weekly** - Track your progress toward break-even
5. **Mobile friendly** - Add expenses on-the-go from your phone

---

## 🔄 Data Flow

```
User Input
    ↓
Add Expense Form
    ↓
SQLite Database (Persistent!)
    ↓
    ├─→ All Expenses Table
    │
    └─→ Analytics Calculator
         ├─→ Sum up Allen's expenses
         ├─→ Sum up Bishoy's expenses
         ├─→ Sum up Turo income
         ├─→ Split Turo 50/50
         ├─→ Calculate net positions
         └─→ Project break-even date
              (using trend analysis)
```

---

## 🎯 What Makes This Better Than Google Sheets?

✅ **Real-time calculations** - No manual formulas
✅ **Clean interface** - Easy to use on mobile
✅ **Automatic projections** - See when you'll break even
✅ **Always accessible** - Just open the URL
✅ **No accidental edits** - Can't mess up formulas
✅ **Visual analytics** - Beautiful charts and cards
✅ **Persistent data** - Never loses your data
✅ **Fast entry** - Add expenses in seconds

---

## 🚀 Next Steps

1. Deploy to Render (see DEPLOYMENT.md)
2. Add all your current expenses from the Google Sheet
3. Start using it daily
4. Watch your progress toward profitability!
