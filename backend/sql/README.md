# Supabase tarot card data

`supabase_tarot_cards.sql` creates the `public.tarot_cards` table when it does
not exist and upserts all 78 tarot cards. It is safe to run repeatedly.

## Apply in Supabase

1. Open the project's **SQL Editor**.
2. Paste the complete contents of `supabase_tarot_cards.sql`.
3. Select **Run**.
4. Confirm the result row reports `78 / 22 / 56` for total, major, and minor
   cards.

The SQL stores upright keywords in a PostgreSQL `TEXT[]` column. Tarot cards
are always upright, and an existing `reversed_keywords` column is removed when
the script is applied.
Row-level security is enabled without an `anon` or `authenticated` policy, so
the table remains available to the backend's direct database connection but is
not exposed through the Supabase Data API.

## Regenerate

The source of truth remains `app/deck.py`. After changing that file, regenerate
the SQL from the `backend` directory:

```bash
uv run python -m scripts.export_tarot_cards_sql
```

The generator does not connect to Supabase or read environment variables.
