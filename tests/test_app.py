import importlib
import os
import tempfile
import unittest
from datetime import date


class ExpenseAppTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        cls.db_file.close()
        os.environ["DATABASE_URL"] = f"sqlite:///{cls.db_file.name}"

        app_module = importlib.import_module("app")
        cls.app_module = app_module
        cls.app = app_module.app
        cls.db = app_module.db
        cls.Expense = app_module.Expense

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            cls.db.session.remove()
            cls.db.engine.dispose()
        os.unlink(cls.db_file.name)
        os.environ.pop("DATABASE_URL", None)

    def setUp(self):
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()
        with self.app.app_context():
            self.db.drop_all()
            self.db.create_all()

    def test_expenses_endpoint_returns_expenses_by_newest_date_first(self):
        with self.app.app_context():
            self.db.session.add_all(
                [
                    self.Expense(
                        item="Old gas",
                        amount=20,
                        paid_by="Bishoy",
                        date=date(2026, 1, 1),
                    ),
                    self.Expense(
                        item="New registration",
                        amount=40,
                        paid_by="Allen",
                        date=date(2026, 2, 1),
                    ),
                ]
            )
            self.db.session.commit()

        response = self.client.get("/api/expenses")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [expense["item"] for expense in response.get_json()],
            ["New registration", "Old gas"],
        )

    def test_expenses_template_has_filter_pagination_and_mobile_controls(self):
        response = self.client.get("/")
        html = response.get_data(as_text=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn('id="payerFilter"', html)
        self.assertIn('value="Bishoy"', html)
        self.assertIn('value="Allen"', html)
        self.assertIn('value="Turo"', html)
        self.assertIn('id="pageSize"', html)
        self.assertIn('id="prevPage"', html)
        self.assertIn('id="nextPage"', html)
        self.assertIn("renderExpensesPage", html)
        self.assertIn("@media (max-width: 640px)", html)


if __name__ == "__main__":
    unittest.main()
