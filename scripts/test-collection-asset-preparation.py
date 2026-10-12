"""Verify collection discovery and generation beyond six items, without app writes."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("preparation", Path(__file__).with_name("prepare-collection-assets.py"))
preparation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preparation)


def fixture(source, number, theme="coin"):
    code = f"{theme}_{number:02}"
    files = [source / theme / code / "complete" / f"{code}.png"] + [
        source / theme / code / "growth" / f"growth_{code}_{stage:02}.png"
        for stage in range(1, 6)
    ]
    for file in files:
        file.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (2, 2), (1, 2, 3, 255)).save(file)
    return files


class PreparationTests(unittest.TestCase):
    def test_more_than_six_numeric_order_and_gaps(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            for number in [100, 12, 7, 2, 1]:
                fixture(source, number)
            (source / "coin/coin_01/growth_backup_20261008").mkdir()
            items = preparation.discover_items(source)
            self.assertEqual([item["number"] for item in items], [1, 2, 7, 12, 100])
            self.assertIn("COIN_100", preparation.manifest_text(items))
            self.assertIn("DEV_COIN_100", preparation.seed_text(items))

    def test_generated_manifest_and_catalog_include_seventh(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            output = Path(directory) / "app"
            for number in range(1, 8):
                fixture(source, number)
            summary = preparation.prepare_collection(source, output)
            self.assertEqual(summary["items"], 7)
            self.assertEqual(summary["files"], 42)
            self.assertIn("COIN_07", (output / "src/features/learning/assets/collection-assets.ts").read_text())
            self.assertIn("DEV_COIN_07", (output / "supabase/seed.sql").read_text(encoding="utf-8"))
            self.assertEqual(len(list((output / "assets").rglob("*.webp"))), 42)

    def test_incomplete_item_aborts_before_overwriting_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            output = Path(directory) / "app"
            fixture(source, 7)[-1].unlink()
            catalog = output / "supabase/seed.sql"
            catalog.parent.mkdir(parents=True)
            catalog.write_text("existing catalog")
            with self.assertRaisesRegex(ValueError, "growth_coin_07_05"):
                preparation.prepare_collection(source, output)
            self.assertEqual(catalog.read_text(), "existing catalog")


if __name__ == "__main__":
    unittest.main()
