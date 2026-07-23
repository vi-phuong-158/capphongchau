import importlib.util
import tempfile
import sys
import unittest
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "import_existing_certificates", ROOT / "scripts" / "import_existing_certificates.py"
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ImportExistingCertificatesTests(unittest.TestCase):
    def source_row(self, *, birth: str, citizen_id: str = "012345678901"):
        row = [""] * 14
        row[2] = "AB 123"
        row[3] = "01/01/2010"
        row[4] = "SO-01"
        row[7] = "Nguyen Van A"
        row[8] = birth
        row[10] = citizen_id
        row[13] = "Chu su dung"
        return row

    def test_year_only_birth_does_not_exclude_a_valid_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            for _ in range(4):
                sheet.append([""] * 14)
            sheet.append(self.source_row(birth="1980"))
            sheet.append(self.source_row(birth="", citizen_id="not-a-citizen-id"))
            workbook.save(path)
            valid, invalid = MODULE.read_source(path)

        self.assertEqual(len(valid), 1)
        self.assertEqual(valid[0].citizen_id, "012345678901")
        self.assertEqual(invalid, [{"sourceRow": 6, "reasons": ["INVALID_CITIZEN_ID"]}])

    def test_backfill_only_appends_missing_or_corrected_rows(self):
        certificates = [
            ["record-1", "A", "A", "2010-01-01", "S", "VERIFIED", "run", "5", "now", "now"],
            ["record-2", "B", "B", "2010-01-01", "S", "CONFLICT", "run", "6", "now", "now"],
        ]
        owners = [
            ["owner-1", "record-1", "a1" * 32, "match-1", "", "VERIFIED", "run", "5", "now"],
            ["owner-2", "record-2", "b2" * 32, "match-2", "", "CONFLICT", "run", "6", "now"],
        ]
        existing_certificates = [
            ["record-1", "A", "A", "2010-01-01", "S", "VERIFIED", "old", "1", "old", "old"],
            ["record-2", "B", "B", "2010-01-01", "S", "VERIFIED", "old", "2", "old", "old"],
        ]
        existing_owners = [owners[0]]
        certificate_appends, owner_appends, buckets, index_count = MODULE.backfill_rows(
            certificates,
            owners,
            existing_certificates,
            existing_owners,
            {(owners[0][2], "record-1")},
        )

        self.assertEqual([row[0] for row in certificate_appends], ["record-2"])
        self.assertEqual([row[0] for row in owner_appends], ["owner-2"])
        self.assertEqual(index_count, 0)
        self.assertEqual(buckets, {})


if __name__ == "__main__":
    unittest.main()