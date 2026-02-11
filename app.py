from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os
from sqlalchemy import func
import numpy as np

app = Flask(__name__)

# Database configuration
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///' + os.path.join(basedir, 'bus_tracker.db'))
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Database Models
class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    paid_by = db.Column(db.String(50), nullable=False)  # 'Allen', 'Bishoy', or 'Turo'
    date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'item': self.item,
            'amount': self.amount,
            'paid_by': self.paid_by,
            'date': self.date.strftime('%Y-%m-%d'),
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

# Create tables and preload data
with app.app_context():
    db.create_all()
    
    # Preload data from Google Sheet if database is empty
    if Expense.query.count() == 0:
        print("Loading initial data from Google Sheet...")
        
        initial_expenses = [
            # Bus Purchase
            {'item': 'Bus Purchase', 'amount': 5500.00, 'paid_by': 'Allen', 'date': '2026-02-11'},
            {'item': 'Bus Purchase', 'amount': 4700.00, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            
            # Bishoy's Expenses
            {'item': 'Tires', 'amount': 400.00, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Flight ticket', 'amount': 390.00, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Lyft', 'amount': 43.47, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Walmart', 'amount': 72.03, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Gas', 'amount': 785.46, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Food', 'amount': 211.02, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Oil pan Gasket', 'amount': 23.56, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Oil change 10Qts', 'amount': 57.76, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Oil filter', 'amount': 11.76, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'RTV Silcon', 'amount': 10.69, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Radio', 'amount': 145.00, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Diesel cleaner', 'amount': 26.50, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Belt', 'amount': 45.00, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            {'item': 'Tires', 'amount': 350.00, 'paid_by': 'Bishoy', 'date': '2026-02-11'},
            
            # Allen's Expenses
            {'item': 'Reg', 'amount': 647.60, 'paid_by': 'Allen', 'date': '2026-02-11'},
            {'item': 'Misc painting detailing', 'amount': 65.00, 'paid_by': 'Allen', 'date': '2026-02-11'},
            {'item': 'Sun pass', 'amount': 11.00, 'paid_by': 'Allen', 'date': '2026-02-11'},
            {'item': 'Cameras', 'amount': 335.00, 'paid_by': 'Allen', 'date': '2026-02-11'},
            {'item': 'Wrap', 'amount': 1000.00, 'paid_by': 'Allen', 'date': '2026-02-11'},
            
            # Turo Payments
            {'item': 'Turo paid', 'amount': 431.00, 'paid_by': 'Turo', 'date': '2025-12-27'},
            {'item': 'Turo paid', 'amount': 159.70, 'paid_by': 'Turo', 'date': '2026-01-19'},
            {'item': 'Turo paid', 'amount': 594.60, 'paid_by': 'Turo', 'date': '2026-02-02'},
            {'item': 'Turo paid', 'amount': 440.64, 'paid_by': 'Turo', 'date': '2026-02-08'},
        ]
        
        for exp_data in initial_expenses:
            expense = Expense(
                item=exp_data['item'],
                amount=exp_data['amount'],
                paid_by=exp_data['paid_by'],
                date=datetime.strptime(exp_data['date'], '%Y-%m-%d').date()
            )
            db.session.add(expense)
        
        db.session.commit()
        print(f"✅ Loaded {len(initial_expenses)} initial expenses from Google Sheet!")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    expenses = Expense.query.order_by(Expense.date.desc()).all()
    return jsonify([e.to_dict() for e in expenses])

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    data = request.json
    
    # Parse date
    if 'date' in data and data['date']:
        expense_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    else:
        expense_date = datetime.now().date()
    
    expense = Expense(
        item=data['item'],
        amount=float(data['amount']),
        paid_by=data['paid_by'],
        date=expense_date
    )
    
    db.session.add(expense)
    db.session.commit()
    
    return jsonify(expense.to_dict()), 201

@app.route('/api/expenses/<int:id>', methods=['DELETE'])
def delete_expense(id):
    expense = Expense.query.get_or_404(id)
    db.session.delete(expense)
    db.session.commit()
    return '', 204

@app.route('/api/expenses/<int:id>', methods=['PUT'])
def update_expense(id):
    expense = Expense.query.get_or_404(id)
    data = request.json
    
    expense.item = data.get('item', expense.item)
    expense.amount = float(data.get('amount', expense.amount))
    expense.paid_by = data.get('paid_by', expense.paid_by)
    
    if 'date' in data and data['date']:
        expense.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    
    db.session.commit()
    return jsonify(expense.to_dict())

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    expenses = Expense.query.all()
    
    allen_paid = sum(e.amount for e in expenses if e.paid_by == 'Allen')
    bishoy_paid = sum(e.amount for e in expenses if e.paid_by == 'Bishoy')
    turo_income = sum(e.amount for e in expenses if e.paid_by == 'Turo')
    
    # Split Turo income 50/50
    allen_share = turo_income / 2
    bishoy_share = turo_income / 2
    
    # Calculate net positions
    allen_net = allen_share - allen_paid
    bishoy_net = bishoy_share - bishoy_paid
    
    # Total costs
    total_costs = allen_paid + bishoy_paid
    
    # Projection calculations
    turo_payments = [e for e in expenses if e.paid_by == 'Turo']
    projection = calculate_projection(turo_payments, total_costs)
    
    return jsonify({
        'allen_paid': round(allen_paid, 2),
        'bishoy_paid': round(bishoy_paid, 2),
        'total_costs': round(total_costs, 2),
        'turo_income': round(turo_income, 2),
        'allen_share': round(allen_share, 2),
        'bishoy_share': round(bishoy_share, 2),
        'allen_net': round(allen_net, 2),
        'bishoy_net': round(bishoy_net, 2),
        'projection': projection
    })

def calculate_projection(turo_payments, total_costs):
    if len(turo_payments) < 2:
        return {
            'break_even_date': None,
            'monthly_average': 0,
            'days_to_break_even': None
        }
    
    # Sort by date
    turo_payments.sort(key=lambda x: x.date)
    
    # Calculate average monthly income
    first_payment = turo_payments[0].date
    last_payment = turo_payments[-1].date
    days_span = (last_payment - first_payment).days
    
    if days_span == 0:
        days_span = 1
    
    total_turo = sum(p.amount for p in turo_payments)
    daily_average = total_turo / days_span if days_span > 0 else 0
    monthly_average = daily_average * 30
    
    # Calculate break-even
    remaining_needed = total_costs - total_turo
    
    if daily_average > 0 and remaining_needed > 0:
        days_to_break_even = remaining_needed / daily_average
        break_even_date = datetime.now().date() + timedelta(days=int(days_to_break_even))
    else:
        days_to_break_even = 0 if remaining_needed <= 0 else None
        break_even_date = datetime.now().date() if remaining_needed <= 0 else None
    
    return {
        'break_even_date': break_even_date.strftime('%Y-%m-%d') if break_even_date else None,
        'monthly_average': round(monthly_average, 2),
        'days_to_break_even': int(days_to_break_even) if days_to_break_even else None,
        'daily_average': round(daily_average, 2)
    }

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
