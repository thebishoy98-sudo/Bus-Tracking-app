import importlib
import os
import tempfile
import unittest
from datetime import date
from unittest.mock import patch


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

    def test_database_uri_uses_render_postgres_url_when_available(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgres://user:pass@host/db"}, clear=False):
            self.assertEqual(
                self.app_module.get_database_uri(),
                "postgresql://user:pass@host/db",
            )

    def test_database_uri_uses_data_dir_sqlite_when_configured(self):
        with tempfile.TemporaryDirectory() as data_dir:
            with patch.dict(os.environ, {"DATA_DIR": data_dir}, clear=True):
                self.assertEqual(
                    self.app_module.get_database_uri(),
                    f"sqlite:///{os.path.join(data_dir, 'bus_tracker.db')}",
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

    def test_analytics_template_has_payment_detail_filter_and_pagination(self):
        response = self.client.get("/")
        html = response.get_data(as_text=True)
        analytics_start = html.index('id="analytics"')
        script_start = html.index("<script>")
        analytics_html = html[analytics_start:script_start]

        self.assertEqual(response.status_code, 200)
        self.assertIn('id="analyticsPayerFilter"', analytics_html)
        self.assertIn('id="analyticsPageSize"', analytics_html)
        self.assertIn('id="analyticsExpenseList"', analytics_html)
        self.assertIn("analyticsPrevPage", html)
        self.assertIn("analyticsNextPage", html)
        self.assertIn("renderAnalyticsExpensesPage", html)


if __name__ == "__main__":
    unittest.main()
