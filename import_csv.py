"""
CSV Import Script for Bus Expense Tracker

This script helps you import your existing Google Sheet data into the database.

Usage:
1. Export your Google Sheet as CSV
2. Format the CSV with columns: Date, Item, Amount, PaidBy
3. Run: python import_csv.py your_data.csv
"""

import csv
import sys
from datetime import datetime
from app import app, db, Expense

def parse_date(date_str):
    """Parse various date formats"""
    formats = [
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%m/%d/%y',
        '%d/%m/%Y',
        '%b %d %Y',
        '%B %d %Y'
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    
    # Default to today if can't parse
    print(f"Warning: Could not parse date '{date_str}', using today")
    return datetime.now().date()

def parse_amount(amount_str):
    """Parse amount strings like '$5,500.00' or '5500'"""
    # Remove $, commas, and whitespace
    cleaned = amount_str.replace('$', '').replace(',', '').strip()
    try:
        return float(cleaned)
    except ValueError:
        print(f"Warning: Could not parse amount '{amount_str}', using 0")
        return 0.0

def import_csv(filename):
    """Import expenses from CSV file"""
    with app.app_context():
        with open(filename, 'r') as f:
            reader = csv.DictReader(f)
            
            count = 0
            for row in reader:
                # Skip empty rows
                if not row.get('Item') and not row.get('Amount'):
                    continue
                
                # Create expense
                expense = Expense(
                    item=row.get('Item', '').strip(),
                    amount=parse_amount(row.get('Amount', '0')),
                    paid_by=row.get('PaidBy', 'Unknown').strip(),
                    date=parse_date(row.get('Date', ''))
                )
                
                db.session.add(expense)
                count += 1
                print(f"Added: {expense.item} - ${expense.amount} ({expense.paid_by})")
            
            db.session.commit()
            print(f"\n✅ Successfully imported {count} expenses!")

def create_sample_csv():
    """Create a sample CSV from your Google Sheet data"""
    sample_data = [
        ['Date', 'Item', 'Amount', 'PaidBy'],
        ['2026-02-11', 'Bus Purchase', '5500.00', 'Allen'],
        ['2026-02-11', 'Bus Purchase', '4700.00', 'Bishoy'],
        ['2026-02-11', 'Tires', '400.00', 'Bishoy'],
        ['2026-02-11', 'Fligh ticket', '390.00', 'Bishoy'],
        ['2026-02-11', 'Lyft', '43.47', 'Bishoy'],
        ['2026-02-11', 'Walmart', '72.03', 'Bishoy'],
        ['2026-02-11', 'Gas', '785.46', 'Bishoy'],
        ['2026-02-11', 'Food', '211.02', 'Bishoy'],
        ['2026-02-11', 'Reg', '647.60', 'Allen'],
        ['2026-02-11', 'Misc painting detailing', '65.00', 'Allen'],
        ['2026-02-11', 'Oil pan Gasket', '23.56', 'Bishoy'],
        ['2026-02-11', 'Oil change 10Qts', '57.76', 'Bishoy'],
        ['2026-02-11', 'Oil filter', '11.76', 'Bishoy'],
        ['2026-02-11', 'RTV Silcon', '10.69', 'Bishoy'],
        ['2026-02-11', 'Sun pass', '11.00', 'Allen'],
        ['2026-02-11', 'Radio', '145.00', 'Bishoy'],
        ['2026-02-11', 'Diesel cleaner', '26.50', 'Bishoy'],
        ['2026-02-11', 'Cameras', '335.00', 'Allen'],
        ['2026-02-11', 'Wrap', '1000.00', 'Allen'],
        ['2026-02-11', 'Belt', '45.00', 'Bishoy'],
        ['2026-02-11', 'Tires', '350.00', 'Bishoy'],
        ['2025-12-27', 'Turo paid', '431.00', 'Turo'],
        ['2026-01-19', 'Turo paid', '159.70', 'Turo'],
        ['2026-02-02', 'Turo paid', '594.60', 'Turo'],
        ['2026-02-08', 'Turo paid', '440.64', 'Turo'],
    ]
    
    with open('bus_expenses_sample.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(sample_data)
    
    print("✅ Created bus_expenses_sample.csv")
    print("You can edit this file and then import it!")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python import_csv.py <filename.csv>  - Import from CSV")
        print("  python import_csv.py --sample        - Create sample CSV")
        sys.exit(1)
    
    if sys.argv[1] == '--sample':
        create_sample_csv()
    else:
        import_csv(sys.argv[1])
