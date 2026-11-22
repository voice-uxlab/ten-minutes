# Supabase tarot card data

`supabase_tarot_cards.sql` creates the `public.tarot_cards` table when it does
not exist and upserts all 78 tarot cards. It is safe to run repeatedly.

## Apply in Supabase

1. Open the project's **SQL Editor**.
2. Paste the complete contents of `supabase_tarot_cards.sql`.
3. Select **Run**.
4. Confirm the result row reports `78 / 22 / 56` for total, major, and minor
   cards.

The SQL uses PostgreSQL `TEXT[]` columns for upright and reversed keywords,
matching the backend SQLAlchemy model and Alembic schema.

## Regenerate

The source of truth remains `app/deck.py`. After changing that file, regenerate
the SQL from the `backend` directory:

```bash
uv run python -m scripts.export_tarot_cards_sql
```

The generator does not connect to Supabase or read environment variables.
