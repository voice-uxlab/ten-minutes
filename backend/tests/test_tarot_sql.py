from pathlib import Path

from app.deck import DECK, card_code
from scripts.export_tarot_cards_sql import render_sql


def test_supabase_tarot_sql_matches_the_deck_source():
    sql_path = Path(__file__).resolve().parents[1] / "sql" / "supabase_tarot_cards.sql"
    sql = sql_path.read_text(encoding="utf-8")

    assert len(DECK) == 78
    assert len({card[0] for card in DECK}) == 78
    assert len({card_code(card[0]) for card in DECK}) == 78
    assert sql == render_sql()
    assert sql.count("\n    (") == 78
    assert "DROP COLUMN IF EXISTS reversed_keywords" in sql
    assert "ARRAY[]::text[]" not in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
