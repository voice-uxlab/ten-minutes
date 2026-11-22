"""Generate the standalone Supabase tarot card schema and seed SQL."""

from pathlib import Path

from app.deck import DECK, card_code, card_taxonomy


OUTPUT_PATH = Path(__file__).resolve().parents[1] / "sql" / "supabase_tarot_cards.sql"


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql_array(values: tuple[str, ...]) -> str:
    return "ARRAY[" + ", ".join(sql_literal(value) for value in values) + "]::text[]"


def render_row(card: tuple) -> str:
    card_id, name, upright = card
    taxonomy = card_taxonomy(card_id)
    suit = "NULL" if taxonomy.suit is None else sql_literal(taxonomy.suit)
    return (
        "    ("
        f"{card_id}, {sql_literal(card_code(card_id))}, {sql_literal(name)}, "
        f"{sql_literal(taxonomy.arcana)}, {suit}, {sql_literal(taxonomy.rank)}, "
        f"{sql_array(upright)}"
        ")"
    )


def render_sql() -> str:
    rows = ",\n".join(render_row(card) for card in DECK)
    return f"""-- Ten Minutes tarot card reference data for Supabase/PostgreSQL.
-- The Korean keywords are project-curated summaries of conventional
-- Rider-Waite-Smith upright interpretations.
-- This file is idempotent: it can be safely executed more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tarot_cards (
    id SMALLINT PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name_ko VARCHAR(64) NOT NULL,
    arcana VARCHAR(8) NOT NULL,
    suit VARCHAR(16),
    rank VARCHAR(16) NOT NULL,
    upright_keywords TEXT[] NOT NULL,
    CONSTRAINT ck_tarot_cards_id CHECK (id BETWEEN 0 AND 77),
    CONSTRAINT ck_tarot_cards_arcana CHECK (arcana IN ('MAJOR', 'MINOR')),
    CONSTRAINT ck_tarot_cards_suit CHECK (
        (arcana = 'MAJOR' AND suit IS NULL)
        OR
        (arcana = 'MINOR' AND suit IN ('WANDS', 'CUPS', 'SWORDS', 'PENTACLES'))
    )
);

ALTER TABLE public.tarot_cards
    DROP COLUMN IF EXISTS reversed_keywords;

ALTER TABLE public.tarot_cards ENABLE ROW LEVEL SECURITY;

INSERT INTO public.tarot_cards (
    id,
    code,
    name_ko,
    arcana,
    suit,
    rank,
    upright_keywords
)
VALUES
{rows}
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name_ko = EXCLUDED.name_ko,
    arcana = EXCLUDED.arcana,
    suit = EXCLUDED.suit,
    rank = EXCLUDED.rank,
    upright_keywords = EXCLUDED.upright_keywords;

COMMIT;

-- Expected result: total_count=78, major_count=22, minor_count=56.
SELECT
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE arcana = 'MAJOR') AS major_count,
    COUNT(*) FILTER (WHERE arcana = 'MINOR') AS minor_count
FROM public.tarot_cards;
"""


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(render_sql(), encoding="utf-8")
    print(f"Generated {OUTPUT_PATH} with {len(DECK)} cards.")


if __name__ == "__main__":
    main()
